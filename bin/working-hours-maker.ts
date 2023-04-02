#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { WorkingHoursMakerStack } from '../lib/working-hours-maker-stack';

const app = new cdk.App();
new WorkingHoursMakerStack(app, 'WorkingHoursMakerStack');
