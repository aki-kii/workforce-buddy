import * as cdk from "aws-cdk-lib";
import {
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_kms as kms,
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_ssm as ssm,
} from "aws-cdk-lib";
import { Construct } from "constructs";

export interface LambdaProps {
  table: dynamodb.ITable;
  bucket: s3.IBucket;
  appKey: kms.IKey;
}

export class Lambda extends Construct {
  public readonly getWorkData: lambda.Function;
  public readonly storeWorkData: lambda.Function;
  public readonly createWorkSchedule: lambda.Function;
  public readonly sendWorkSchedule: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaProps) {
    super(scope, id);

    //-------------------------------------------
    // KMS

    // KMS Key
    props.appKey.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*",
        ],
        principals: [
          new iam.AnyPrincipal().withConditions({
            ArnLike: {
              "aws:PrincipalArn": `arn:aws:iam::${
                cdk.Stack.of(this).account
              }:role/*`,
            },
          }),
        ],
        resources: ["*"],
      })
    );

    // KMS Policy
    const kmsPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "kms:Encrypt*",
        "kms:Decrypt*",
        "kms:ReEncrypt*",
        "kms:GenerateDataKey*",
        "kms:Describe*",
      ],
      resources: [props.appKey.keyArn],
    });

    //-------------------------------------------
    // Lambda

    // Lambda Layer
    const slackLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "slackLayer",
      "arn:aws:lambda:ap-northeast-1:080455691515:layer:python_package_for_slack:2"
    );
    const pandasLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "pandasLayer",
      "arn:aws:lambda:ap-northeast-1:770693421928:layer:Klayers-p39-pandas:15"
    );
    const openpyxlLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "openpyxlLayer",
      "arn:aws:lambda:ap-northeast-1:080455691515:layer:python-lib_openpyxl:1"
    );

    // SSM ParameterStore
    const slackBotToken = ssm.StringParameter.valueForStringParameter(
      this,
      "/workforce_buddy/slack_bot_token"
    );

    /**
     * Name: GetWorkData
     * Resource: Lambda Function
     * Description: Slackへアップロードされた勤務データファイルを取得する関数
     */
    // Lambda Function
    const getWorkData = new lambda.Function(this, "GetWorkData", {
      functionName: "GetWorkData",
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("src/lambda/get_work_data"),
      handler: "get_work_data.lambda_handler",
      layers: [slackLayer],
      timeout: cdk.Duration.minutes(1),
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        SLACK_BOT_TOKEN: slackBotToken,
      },
      environmentEncryption: props.appKey,
    });
    // IAM Role
    getWorkData.addToRolePolicy(kmsPolicy);
    getWorkData.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject", "s3:DeleteObject"],
        resources: [`${props.bucket.bucketArn}*`],
      })
    );
    this.getWorkData = getWorkData;

    /**
     * Name: StoreWorkData
     * Resource: Lambda Function
     * Description: 勤務データを加工し、Key-Value型DBへ格納する関数
     */
    // Lambda Function
    const storeWorkData = new lambda.Function(this, "StoreWorkData", {
      functionName: "StoreWorkData",
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("src/lambda/store_work_data"),
      handler: "store_work_data.lambda_handler",
      layers: [pandasLayer],
      timeout: cdk.Duration.minutes(1),
      environment: {
        TABLE_NAME: props.table.tableName,
        BUCKET_NAME: props.bucket.bucketName,
      },
      environmentEncryption: props.appKey,
    });
    // IAM Role
    storeWorkData.addToRolePolicy(kmsPolicy);
    storeWorkData.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:BatchWriteItem"],
        resources: ["*"],
      })
    );
    storeWorkData.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`${props.bucket.bucketArn}*`],
      })
    );
    this.storeWorkData = storeWorkData;

    /**
     * Name: CreateWorkSchedule
     * Resource: Lambda Function
     * Description: 勤務データを加工し、Excelテンプレートファイルに書き込み勤務表を作成する関数
     */
    // Lambda Function
    const createWorkSchedule = new lambda.Function(this, "CreateWorkSchedule", {
      functionName: "CreateWorkSchedule",
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("src/lambda/create_work_schedule"),
      handler: "create_work_schedule.lambda_handler",
      layers: [pandasLayer, openpyxlLayer],
      timeout: cdk.Duration.minutes(1),
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        TABLE_NAME: props.table.tableName,
      },
      environmentEncryption: props.appKey,
    });
    // IAM Role
    createWorkSchedule.addToRolePolicy(kmsPolicy);
    createWorkSchedule.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:Query"],
        resources: [props.table.tableArn],
      })
    );
    createWorkSchedule.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:PutObject"],
        resources: [`${props.bucket.bucketArn}*`],
      })
    );
    this.createWorkSchedule = createWorkSchedule;

    /**
     * Name: SendWorkSchedule
     * Resource: Lambda Function
     * Description: 勤務表をSlackへアップロードし、ユーザへ共有する関数
     */
    // Lambda Function
    const sendWorkSchedule = new lambda.Function(this, "SendWorkSchedule", {
      functionName: "SendWorkSchedule",
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("src/lambda/send_work_schedule"),
      handler: "send_work_schedule.lambda_handler",
      layers: [slackLayer],
      timeout: cdk.Duration.minutes(1),
      environment: {
        SLACK_BOT_TOKEN: slackBotToken,
      },
      environmentEncryption: props.appKey,
    });
    // IAM Role
    sendWorkSchedule.addToRolePolicy(kmsPolicy);
    sendWorkSchedule.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`${props.bucket.bucketArn}*`],
      })
    );
    this.sendWorkSchedule = sendWorkSchedule;
  }
}
