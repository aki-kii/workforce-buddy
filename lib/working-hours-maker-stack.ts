import * as cdk from "aws-cdk-lib";
import {
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_events as events,
  aws_stepfunctions as sfn,
  aws_iam as iam,
  aws_events_targets as targets,
} from "aws-cdk-lib";

export class WorkingHoursMakerStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /* S3 Bucket */
    const bucket = new s3.Bucket(this, "Bucket", {
      bucketName: "working-hours-bucket",
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      eventBridgeEnabled: true,
    });

    /* Lambda Layer*/
    const lambdaLayers = [
      lambda.LayerVersion.fromLayerVersionArn(
        this,
        "Layer",
        "arn:aws:lambda:ap-northeast-1:080455691515:layer:python_package_for_slack:2"
      ),
    ];

    /* Lambda Function */
    const getWorkingHours = new lambda.Function(this, "GetWorkingHours", {
      functionName: "get_working_hours",
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("src/lambda/get_working_hours"),
      handler: "get_working_hours.lambda_handler",
      layers: lambdaLayers,
      environment: {
        BUCKET_NAME: bucket.bucketName,
        SLACK_ACCESS_TOKEN:
          "xoxb-4861309306404-4882559323600-6WxJzyvCdA8Af95rH7mO79ns",
      },
    });
    getWorkingHours.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedOrigins: ["*"],
      },
    });
    getWorkingHours.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject", "s3:DeleteObject"],
        resources: [`${bucket.bucketArn}*`],
      })
    );

    /* Step Functions */
    const stateMachine = new sfn.StateMachine(
      this,
      "WorkScheduleStateMachine",
      {
        stateMachineName: "WorkScheduleStateMachine",
        definition: new sfn.Pass(this, "StoreWorkData").next(
          new sfn.Pass(this, "CreateWorkSchedule")
        ),
      }
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
      targets: [new targets.SfnStateMachine(stateMachine)],
    });
  }
}
