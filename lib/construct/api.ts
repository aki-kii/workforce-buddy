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
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export interface ApiProps {
  table: ITable;
}

export class Api extends Construct {
  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    //-----------------------------------
    // Step Functions

    // ステートマシン定義ファイル
    let definitionString = fs
      .readFileSync("./src/stepfunctions/CreateUserConfig.asl.json")
      .toString();
    definitionString = definitionString.replace(
      /WORKSCHEDULE_DYNAMODB_TABLE_NAME/g,
      `${props.table.tableName}`
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
        resources: [props.table.tableArn],
      })
    );
  }
}
