import * as cdk from "aws-cdk-lib";
import {
  aws_iam as iam,
  aws_kms as kms,
  aws_lambda as lambda,
  aws_ssm as ssm,
} from "aws-cdk-lib";
import { Construct } from "constructs";

export interface LambdaProps {
  appKey: kms.IKey;
  workscheduleMakerKey: string;
}

export class Lambda extends Construct {
  public readonly handleWorkforceBuddy: lambda.Function;

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

    // SSM ParameterStore
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
    const slackBoltLayerArn = ssm.StringParameter.valueForStringParameter(
      this,
      "/lambda-layer/python/slack-bolt"
    );

    // Lambda Layer
    const slackBoltLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "slackBoltLayer",
      slackBoltLayerArn
    );

    /**
     * Name: HandleWorkforceBuddy
     * Resource: Lambda Function
     * Description: Slack BOTのハンドラ関数
     */
    // Lambda Function
    const handleWorkforceBuddy = new lambda.Function(
      this,
      "handleWorkforceBuddy",
      {
        functionName: "HandleWorkforceBuddy",
        runtime: lambda.Runtime.PYTHON_3_9,
        code: lambda.Code.fromAsset("src/lambda/handle_workforce_buddy"),
        handler: "handle_workforce_buddy.lambda_handler",
        layers: [slackBoltLayer],
        timeout: cdk.Duration.minutes(1),
        environment: {
          SLACK_SIGNING_SECRET: slackSigningSecret,
          SLACK_BOT_TOKEN: slackBotToken,
          SLACK_BOT_ID: slackBotId,
          WORKSCHEDULE_MAKER_KEY: props.workscheduleMakerKey,
        },
      }
    );
    // IAM Role
    handleWorkforceBuddy.addToRolePolicy(kmsPolicy);
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
    this.handleWorkforceBuddy = handleWorkforceBuddy;
  }
}
