import { Names, Stack, StackProps } from "aws-cdk-lib";
import { Key } from "aws-cdk-lib/aws-kms";
import { Construct } from "constructs";
import { Batch } from "../construct/workschedule/batch";
import { Datastore } from "../construct/workschedule/datastore";

export interface WorkscheduleMakerStackProps extends StackProps {}
export class WorkscheduleMakerStack extends Stack {
  public readonly activationKey: string;
  constructor(
    scope: Construct,
    id: string,
    props: WorkscheduleMakerStackProps
  ) {
    super(scope, id, props);

    const cmk = new Key(this, "CMK", {
      enableKeyRotation: true,
      alias: Names.uniqueResourceName(this, {}),
    });

    const datastore = new Datastore(this, "Datastore", {
      appKey: cmk,
    });

    const batch = new Batch(this, "Batch", {
      appKey: cmk,
      bucket: datastore.bucket,
      table: datastore.table,
    });
    this.activationKey = batch.activationKey;
  }
}
