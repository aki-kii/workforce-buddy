import { aws_dynamodb as dynamodb } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface DatastoreProps {}

export class Datastore extends Construct {
  public readonly table: dynamodb.Table;
  constructor(scope: Construct, id: string, props: DatastoreProps) {
    super(scope, id);

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
    this.table = table;
  }
}
