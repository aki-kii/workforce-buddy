import { aws_kms as kms, aws_lambda as lambda } from "aws-cdk-lib";
import { Construct } from "constructs";

import { Lambda } from "./lambda";

export interface ApiProps {
  appKey: kms.IKey;
  workscheduleMakerKey: string;
}

export class Api extends Construct {
  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    //-------------------------------------------
    // Lambda

    // Lambda Function
    const functions = new Lambda(this, "LambdaSlackHandle", {
      appKey: props.appKey,
      workscheduleMakerKey: props.workscheduleMakerKey,
    });

    // Lambda FunctionURLs
    functions.handleWorkforceBuddy.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedOrigins: ["*"],
      },
    });
  }
}
