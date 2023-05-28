import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { FunctionUrlAuthType, LayerVersion } from 'aws-cdk-lib/aws-lambda';
import { BlockPublicAccess } from 'aws-cdk-lib/aws-s3';


export class WorkingHoursMakerStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const getWorkingHours = new lambda.Function(this, 'GetWorkingHours',{
      functionName: 'get_working_hours',
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('src/lambda'),
      handler: 'get_working_hours.lambda_handler'
    });
    getWorkingHours.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
      cors: {
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedOrigins: ['*']
      }
    })

    const bucket = new s3.Bucket(this, 'working-hours-bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
  }
}
