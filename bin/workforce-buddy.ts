#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { WorkforceBuddyStack } from "../lib/stack/workforce-buddy-stack";

const app = new cdk.App();

new WorkforceBuddyStack(app, "WorkforceBudyApiStack", {});
