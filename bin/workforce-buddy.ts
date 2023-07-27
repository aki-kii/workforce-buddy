#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { WorkforceBuddyApiStack } from "../lib/stack/workforce-buddy-api-stack";
import { WorkscheduleMakerStack } from "../lib/stack/workschedule-batch-stack";

const app = new cdk.App();

const workScheduleMaker = new WorkscheduleMakerStack(
  app,
  "WorkscheduleMakerStack",
  {}
);
new WorkforceBuddyApiStack(app, "WorkforceBudyApiStack", {
  workscheduleMakerKey: workScheduleMaker.activationKey,
});
