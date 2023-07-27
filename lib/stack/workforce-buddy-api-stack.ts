import { Names, Stack, StackProps } from "aws-cdk-lib";
import { Key } from "aws-cdk-lib/aws-kms";
import { Construct } from "constructs";
import { Api } from "../construct/workforce-buddy/api";

export interface WorkforceBuddyApiStackProps extends StackProps {
  workscheduleMakerKey: string;
}
export class WorkforceBuddyApiStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: WorkforceBuddyApiStackProps
  ) {
    super(scope, id, props);

    const cmk = new Key(this, "CMK", {
      enableKeyRotation: true,
      alias: Names.uniqueResourceName(this, {}),
    });

    new Api(this, "Api", {
      appKey: cmk,
      workscheduleMakerKey: props.workscheduleMakerKey,
    });
  }
}
