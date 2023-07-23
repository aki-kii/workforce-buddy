import * as cdk from "aws-cdk-lib";
import * as fs from "fs";
import {
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_dynamodb as dynamodb,
  aws_events as events,
  aws_stepfunctions as sfn,
  aws_iam as iam,
  aws_events_targets as targets,
} from "aws-cdk-lib";
import { DefinitionBody } from "aws-cdk-lib/aws-stepfunctions";
import { Datastore } from "../construct/datastore";

export class WorkScheduleMakerStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const datastore = new Datastore(this, "Datastore", {});

    /* Step Functions */
    // ステートマシン定義ファイル
    let definitionString = fs
      .readFileSync("./src/stepfunctions/CreateUserConfig.asl.json")
      .toString();
    definitionString = definitionString.replace(
      /WORKSCHEDULE_DYNAMODB_TABLE_NAME/g,
      `${table.tableName}`
    );
    // ステートマシン
    const createuserconfig_statemachine = new sfn.StateMachine(
      this,
      "CreateUserConfigStatemachine",
      {
        stateMachineName: "CreateUserConfig",
        definitionBody: sfn.DefinitionBody.fromString(definitionString),
      }
    );
    // IAM Role
    createuserconfig_statemachine.addToRolePolicy(
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
        /STORE_WORK_DATA_LAMBDA_ARN/g,
        `${storeWorkData.functionArn}:$LATEST`
      )
      .replace(/WORKSCHEDULE_DYNAMODB_TABLE_NAME/g, `${table.tableName}`);
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
        resources: [`${storeWorkData.functionArn}:$LATEST`],
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
        resources: [createuserconfig_statemachine.stateMachineArn],
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
