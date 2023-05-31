#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { WorkScheduleMakerStack } from "../lib/working-hours-maker-stack";

const app = new cdk.App();
new WorkScheduleMakerStack(app, "WorkingHoursMakerStack");
