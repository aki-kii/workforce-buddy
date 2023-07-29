import { Names, Stack, StackProps } from "aws-cdk-lib";
import { Key } from "aws-cdk-lib/aws-kms";
import { Construct } from "constructs";
import { Api } from "../construct/workforce-buddy/api";
import { Batch as WorkScheduleBatch } from "../construct/workschedule/batch";
import { Datastore as WorkScheduleDatastore } from "../construct/workschedule/datastore";

export interface WorkforceBuddyStackProps extends StackProps {}
export class WorkforceBuddyStack extends Stack {
  public readonly appKey: Key;
  constructor(scope: Construct, id: string, props: WorkforceBuddyStackProps) {
    super(scope, id, props);

    const cmk = new Key(this, "CMK", {
      enableKeyRotation: true,
      alias: Names.uniqueResourceName(this, {}),
    });
    this.appKey = cmk;

    const workScheduleDatastore = new WorkScheduleDatastore(this, "Datastore", {
      appKey: cmk,
    });

    const workScheduleBatch = new WorkScheduleBatch(this, "Batch", {
      appKey: cmk,
      bucket: workScheduleDatastore.bucket,
      table: workScheduleDatastore.table,
    });

    new Api(this, "Api", {
      appKey: cmk,
      workscheduleMakerKey: workScheduleBatch.activationKey,
    });
  }
}
