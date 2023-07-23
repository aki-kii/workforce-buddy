import * as cdk from "aws-cdk-lib";
import {
  aws_dynamodb as dynamodb,
  aws_events as events,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_stepfunctions as sfn,
  aws_ssm as ssm,
  aws_events_targets as targets,
} from "aws-cdk-lib";
import * as fs from "fs";
export class WorkScheduleMakerStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /* S3 Bucket */
    const bucket = new s3.Bucket(this, "WorkScheduleBucket", {
      bucketName: "work-schedule-bucket",
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      eventBridgeEnabled: true,
    });

    /* DynamoDB */
    const table = new dynamodb.Table(this, "WorkScheduleTable", {
      tableName: "WorkScheduleTable",
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    /* Lambda Layer*/
    const slackLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "slackLayer",
      "arn:aws:lambda:ap-northeast-1:080455691515:layer:python_package_for_slack:2"
    );
    const slackBoltLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "slackBoltLayer",
      "arn:aws:lambda:ap-northeast-1:080455691515:layer:BoltLayerDF8D0C33:2"
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

    /* Lambda Function */
    const slackSigningSecret = ssm.StringParameter.valueForStringParameter(
      this,
      "/workforce_buddy/slack_signing_secret"
    );
    const slackBotToken = ssm.StringParameter.valueForStringParameter(
      this,
      "/workforce_buddy/slack_bot_token"
    );
    const slackBotId = ssm.StringParameter.valueForStringParameter(
      this,
      "/workforce_buddy/slack_bot_id"
    );
    const handleWorkforceBuddy = new lambda.Function(
      this,
      "handleWorkforceBuddy",
      {
        functionName: "handleWorkforceBuddy",
        runtime: lambda.Runtime.PYTHON_3_9,
        code: lambda.Code.fromAsset("src/lambda/handle_workforce_buddy"),
        handler: "handle_workforce_buddy.lambda_handler",
        layers: [slackBoltLayer],
        timeout: cdk.Duration.minutes(1),
        environment: {
          SLACK_SIGNING_SECRET: slackSigningSecret,
          SLACK_BOT_TOKEN: slackBotToken,
          SLACK_BOT_ID: slackBotId,
        },
      }
    );
    handleWorkforceBuddy.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedOrigins: ["*"],
      },
    });
    handleWorkforceBuddy.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["states:StartExecution"],
        resources: ["*"],
      })
    );
    handleWorkforceBuddy.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: ["*"],
      })
    );

    const getWorkData = new lambda.Function(this, "GetWorkData", {
      functionName: "GetWorkData",
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("src/lambda/get_work_data"),
      handler: "get_work_data.lambda_handler",
      layers: [slackLayer],
      timeout: cdk.Duration.minutes(1),
      environment: {
        BUCKET_NAME: bucket.bucketName,
        SLACK_BOT_TOKEN: slackBotToken,
      },
    });
    getWorkData.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject", "s3:DeleteObject"],
        resources: [`${bucket.bucketArn}*`],
      })
    );

    const storeWorkData = new lambda.Function(this, "StoreWorkData", {
      functionName: "StoreWorkData",
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("src/lambda/store_work_data"),
      handler: "store_work_data.lambda_handler",
      layers: [pandasLayer],
      timeout: cdk.Duration.minutes(1),
      environment: {
        TABLE_NAME: table.tableName,
        BUCKET_NAME: bucket.bucketName,
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
        resources: [`${bucket.bucketArn}*`],
      })
    );

    const createWorkSchedule = new lambda.Function(this, "CreateWorkSchedule", {
      functionName: "CreateWorkSchedule",
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("src/lambda/create_work_schedule"),
      handler: "create_work_schedule.lambda_handler",
      layers: [pandasLayer, openpyxlLayer],
      timeout: cdk.Duration.minutes(1),
      environment: {
        BUCKET_NAME: bucket.bucketName,
        TABLE_NAME: table.tableName,
      },
    });
    createWorkSchedule.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:Query"],
        resources: ["*"],
      })
    );
    createWorkSchedule.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:PutObject"],
        resources: [`${bucket.bucketArn}*`],
      })
    );

    const SendWorkSchedule = new lambda.Function(this, "SendWorkSchedule", {
      functionName: "SendWorkSchedule",
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("src/lambda/send_work_schedule"),
      handler: "send_work_schedule.lambda_handler",
      layers: [slackLayer],
      timeout: cdk.Duration.minutes(1),
      environment: {
        SLACK_BOT_TOKEN: slackBotToken,
      },
    });
    SendWorkSchedule.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`${bucket.bucketArn}*`],
      })
    );

    /* Step Functions */
    // ステートマシン定義ファイル
    let definitionString = fs
      .readFileSync("./src/stepfunctions/CreateUserConfig.asl.json")
      .toString();
    definitionString = definitionString.replace(
      /WORKSCHEDULE_TABLE_NAME/g,
      `${table.tableName}`
    );
    // ステートマシン
    const createUserConfigStatemachine = new sfn.StateMachine(
      this,
      "CreateUserConfigStatemachine",
      {
        stateMachineName: "CreateUserConfig",
        definitionBody: sfn.DefinitionBody.fromString(definitionString),
      }
    );
    // IAM Role
    createUserConfigStatemachine.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:Query", "dynamodb:GetItem", "dynamodb:PutItem"],
        resources: [table.tableArn],
      })
    );

    definitionString = fs
      .readFileSync("./src/stepfunctions/WorkScheduleStatemachine.asl.json")
      .toString();
    definitionString = definitionString
      .replace(
        /GET_WORK_DATA_LAMBDA_ARN/g,
        `${getWorkData.functionArn}:$LATEST`
      )
      .replace(
        /STORE_WORK_DATA_LAMBDA_ARN/g,
        `${storeWorkData.functionArn}:$LATEST`
      )
      .replace(
        /CREATE_WORK_SCHEDULE_LAMBDA_ARN/g,
        `${createWorkSchedule.functionArn}:$LATEST`
      )
      .replace(
        /SEND_WORK_SCHEDULE_LAMBDA_ARN/g,
        `${SendWorkSchedule.functionArn}:$LATEST`
      )
      .replace(/WORKSCHEDULE_TABLE_NAME/g, `${table.tableName}`)
      .replace(
        /CREATE_USER_CONFIG_STATEMACHINE_ARN/g,
        `${createUserConfigStatemachine.stateMachineArn}`
      );
    const workschedule_statemachine = new sfn.StateMachine(
      this,
      "WorkScheduleStatemachine",
      {
        stateMachineName: "WorkScheduleStateMachine",
        definitionBody: sfn.DefinitionBody.fromString(definitionString),
      }
    );

    workschedule_statemachine.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [
          `${storeWorkData.functionArn}:$LATEST`,
          `${createWorkSchedule.functionArn}:$LATEST`,
          `${SendWorkSchedule.functionArn}:$LATEST`,
        ],
      })
    );
    workschedule_statemachine.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:Query", "dynamodb:GetItem", "dynamodb:PutItem"],
        resources: [table.tableArn],
      })
    );
    workschedule_statemachine.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["states:StartExecution"],
        resources: [createUserConfigStatemachine.stateMachineArn],
      })
    );
    workschedule_statemachine.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["events:PutTargets", "events:PutRule", "events:DescribeRule"],
        resources: ["*"],
      })
    );

    /* Event Bridge */
    new events.Rule(this, "Rule", {
      ruleName: "WorkScheduleRule",
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created"],
        detail: {
          bucket: { name: [bucket.bucketName] },
          object: { key: [{ prefix: "raw/" }] },
        },
      },
      targets: [new targets.SfnStateMachine(workschedule_statemachine)],
    });
  }
}
