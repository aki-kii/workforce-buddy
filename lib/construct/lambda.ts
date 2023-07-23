import * as cdk from "aws-cdk-lib";
import * as fs from "fs";
import {
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_s3 as s3,
} from "aws-cdk-lib";
import { Construct } from "constructs";

export interface LambdaProps {
  table: dynamodb.Table;
  bucket: s3.Bucket;
}

export class Lambda extends Construct {
  public readonly get_work_data: lambda.Function;
  public readonly create_work_schedule: lambda.Function;
  public readonly send_work_schedule: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaProps) {
    super(scope, id);
    /* Lambda Layer*/
    const getWorkDataLayers = [
      lambda.LayerVersion.fromLayerVersionArn(
        this,
        "slackLayer",
        "arn:aws:lambda:ap-northeast-1:080455691515:layer:python_package_for_slack:2"
      ),
    ];
    const storeWorkDataLayers = [
      lambda.LayerVersion.fromLayerVersionArn(
        this,
        "pandasLayer",
        "arn:aws:lambda:ap-northeast-1:770693421928:layer:Klayers-p39-pandas:15"
      ),
    ];

    /* Lambda Function */
    const getWorkData = new lambda.Function(this, "GetWorkData", {
      functionName: "GetWorkData",
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("src/lambda/get_work_data"),
      handler: "get_work_data.lambda_handler",
      layers: getWorkDataLayers,
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        SLACK_ACCESS_TOKEN:
          "xoxb-4861309306404-4882559323600-6WxJzyvCdA8Af95rH7mO79ns",
      },
    });
    getWorkData.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedOrigins: ["*"],
      },
    });
    getWorkData.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject", "s3:DeleteObject"],
        resources: [`${props.bucket.bucketArn}*`],
      })
    );

    const storeWorkData = new lambda.Function(this, "StoreWorkData", {
      functionName: "StoreWorkData",
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("src/lambda/store_work_data"),
      handler: "store_work_data.lambda_handler",
      layers: storeWorkDataLayers,
      environment: {
        TABLE_NAME: props.table.tableName,
      },
    });
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
  }
}
