import * as cdk from "aws-cdk-lib";
import {
  aws_dynamodb as dynamodb,
  aws_kms as kms,
  aws_s3 as s3,
} from "aws-cdk-lib";
import { Construct } from "constructs";

export interface DatastoreProps {
  appKey: kms.IKey;
}

export class Datastore extends Construct {
  public readonly table: dynamodb.Table;
  public readonly bucket: s3.Bucket;
  constructor(scope: Construct, id: string, props: DatastoreProps) {
    super(scope, id);

    //-------------------------------------------
    // DynamoDB

    // DynamoDB Table
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
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: props.appKey,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    this.table = table;

    //-------------------------------------------
    // S3

    // S3 Bucket
    const bucket = new s3.Bucket(this, "WorkScheduleBucket", {
      bucketName: "workschedule-bucket",
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: props.appKey,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    this.bucket = bucket;
  }
}
