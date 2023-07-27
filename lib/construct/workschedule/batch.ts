import {
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_kms as kms,
  aws_s3 as s3,
  aws_stepfunctions as sfn,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as fs from "fs";
import { Lambda } from "./lambda";

export interface BatchProps {
  table: dynamodb.ITable;
  bucket: s3.IBucket;
  appKey: kms.IKey;
}

export class Batch extends Construct {
  public readonly activationKey: string;
  constructor(scope: Construct, id: string, props: BatchProps) {
    super(scope, id);

    //-------------------------------------------
    // Lambda
    const functions = new Lambda(this, "Lambda", {
      table: props.table,
      bucket: props.bucket,
      appKey: props.appKey,
    });

    //-------------------------------------------
    // Step Functions
    /**
     * Name: CreateUserConfig
     * Resource: Step Functions Statemachine
     * Description: ユーザ設定のテンプレートから、ユーザIDに対応する設定を作成する
     */
    // ASL
    let definitionString = fs
      .readFileSync("./src/stepfunctions/CreateUserConfig.asl.json")
      .toString();
    definitionString = definitionString.replace(
      /WORKSCHEDULE_TABLE_NAME/g,
      `${props.table.tableName}`
    );
    // Step Functions Statemachine
    const createUserConfig = new sfn.StateMachine(this, "CreateUserConfig", {
      stateMachineName: "CreateUserConfig",
      definitionBody: sfn.DefinitionBody.fromString(definitionString),
    });
    // IAM Role
    createUserConfig.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:Query", "dynamodb:GetItem", "dynamodb:PutItem"],
        resources: [props.table.tableArn],
      })
    );

    /**
     * Name: WorkScheduleMaker
     * Resource: Step Functions Statemachine
     * Description: 勤務データファイルを加工し勤務表を作成、Slackへアップロードする
     * */
    // ASL
    definitionString = fs
      .readFileSync("./src/stepfunctions/WorkScheduleStatemachine.asl.json")
      .toString();
    definitionString = definitionString
      .replace(
        /GET_WORK_DATA_LAMBDA_ARN/g,
        `${functions.getWorkData.functionArn}:$LATEST`
      )
      .replace(
        /STORE_WORK_DATA_LAMBDA_ARN/g,
        `${functions.storeWorkData.functionArn}:$LATEST`
      )
      .replace(
        /CREATE_WORK_SCHEDULE_LAMBDA_ARN/g,
        `${functions.createWorkSchedule.functionArn}:$LATEST`
      )
      .replace(
        /SEND_WORK_SCHEDULE_LAMBDA_ARN/g,
        `${functions.sendWorkSchedule.functionArn}:$LATEST`
      )
      .replace(/WORKSCHEDULE_TABLE_NAME/g, `${props.table.tableName}`)
      .replace(
        /CREATE_USER_CONFIG_STATEMACHINE_ARN/g,
        `${createUserConfig.stateMachineArn}`
      );
    // Step Functions Statemachine
    const workScheduleMaker = new sfn.StateMachine(this, "WorkScheduleMaker", {
      stateMachineName: "WorkScheduleMaker",
      definitionBody: sfn.DefinitionBody.fromString(definitionString),
    });
    // IAM Role
    workScheduleMaker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [
          `${functions.getWorkData.functionArn}:$LATEST`,
          `${functions.storeWorkData.functionArn}:$LATEST`,
          `${functions.createWorkSchedule.functionArn}:$LATEST`,
          `${functions.sendWorkSchedule.functionArn}:$LATEST`,
        ],
      })
    );
    workScheduleMaker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:Query", "dynamodb:GetItem", "dynamodb:PutItem"],
        resources: [props.table.tableArn],
      })
    );
    workScheduleMaker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["states:StartExecution"],
        resources: [createUserConfig.stateMachineArn],
      })
    );
    workScheduleMaker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["events:PutTargets", "events:PutRule", "events:DescribeRule"],
        resources: ["*"],
      })
    );
    this.activationKey = workScheduleMaker.stateMachineArn;
  }
}
