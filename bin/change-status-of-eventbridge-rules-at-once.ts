#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ChangeStatusOfEventBridgeRulesAtOnceStack } from "../lib/change-status-of-eventbridge-rules-at-once-stack";

const app = new cdk.App();
new ChangeStatusOfEventBridgeRulesAtOnceStack(
  app,
  "ChangeStatusOfEventBridgeRulesAtOnceStack"
);
