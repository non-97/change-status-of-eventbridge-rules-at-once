import {
  Fn,
  Stack,
  StackProps,
  aws_logs as logs,
  aws_iam as iam,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
} from "aws-cdk-lib";
import { Construct } from "constructs";

export class ChangeStatusOfEventBridgeRulesAtOnceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const stackUniqueId = Fn.select(2, Fn.split("/", this.stackId));

    // CloudWatch Logs for State Machines
    const enableOrDisableEventBridgeRulesStateMachineLogGroup =
      new logs.LogGroup(
        this,
        "EnableOrDisableEventBridgeRulesStateMachineLogGroup",
        {
          logGroupName: `/aws/vendedlogs/states/EnableOrDisableEventBridgeRulesStateMachineLogGroup-${stackUniqueId}`,
          retention: logs.RetentionDays.SIX_MONTHS,
        }
      );
    const changeStatusEventBridgeRulesStateMachineLogGroup = new logs.LogGroup(
      this,
      "ChangeStatusEventBridgeRulesStateMachineLogGroup",
      {
        logGroupName: `/aws/vendedlogs/states/ChangeStatusEventBridgeRulesStateMachineLogGroup-${stackUniqueId}`,
        retention: logs.RetentionDays.SIX_MONTHS,
      }
    );

    // State Machine IAM role
    const enableOrDisableEventBridgeRulesStateMachineIamRole = new iam.Role(
      this,
      "EnableOrDisableEventBridgeRulesStateMachineIamRole",
      {
        assumedBy: new iam.ServicePrincipal("states.amazonaws.com"),
        managedPolicies: [
          new iam.ManagedPolicy(
            this,
            "NoticePullRequestEventsFunctionIamPolicy",
            {
              statements: [
                new iam.PolicyStatement({
                  effect: iam.Effect.ALLOW,
                  actions: [
                    "events:EnableRule",
                    "events:ListRules",
                    "events:DisableRule",
                  ],
                  resources: [`arn:aws:events:*:${this.account}:rule/*`],
                }),
              ],
            }
          ),
        ],
      }
    );

    // ----------------------------------
    // State Machine to enable or disable EventBridge Rules
    // ----------------------------------

    // Wait for a set time
    const waitSeconds = new sfn.Wait(this, "WaitSeconds", {
      time: sfn.WaitTime.secondsPath("$.WaitTime.Value"),
    });

    const waitTimestamp = new sfn.Wait(this, "WaitTimestamp", {
      time: sfn.WaitTime.timestampPath("$.WaitTime.Value"),
    });

    // Get the list of EventBridge Rules
    const listRules = new tasks.CallAwsService(this, "ListRules", {
      service: "eventbridge",
      action: "listRules",
      parameters: {
        "NamePrefix.$": "$$.Execution.Input.EventBridgeRule.NamePrefix",
        "EventBusName.$": "$$.Execution.Input.EventBridgeRule.EventBusName",
      },
      iamResources: [`arn:aws:events:*:${this.account}:rule/*`],
      resultPath: "$",
    });

    // Enable EventBridge Rule
    const enableRule = new tasks.CallAwsService(this, "EnableRule", {
      service: "eventbridge",
      action: "enableRule",
      parameters: {
        "Name.$": "$.Name",
        "EventBusName.$": "$$.Execution.Input.EventBridgeRule.EventBusName",
      },
      iamResources: [`arn:aws:events:*:${this.account}:rule/*`],
    });

    // Disable EventBridge Rule
    const disableRule = new tasks.CallAwsService(this, "DisableRule", {
      service: "eventbridge",
      action: "disableRule",
      parameters: {
        "Name.$": "$.Name",
        "EventBusName.$": "$$.Execution.Input.EventBridgeRule.EventBusName",
      },
      iamResources: [`arn:aws:events:*:${this.account}:rule/*`],
    });

    // Loop to enable the EventBridge Rules.
    const enableRuleMap = new sfn.Map(this, "EnableRuleMap", {
      itemsPath: sfn.JsonPath.stringAt("$.Rules"),
    });
    enableRuleMap.iterator(enableRule);

    // Loop to disable the EventBridge Rules.
    const disableRuleMap = new sfn.Map(this, "DisableRuleMap", {
      itemsPath: sfn.JsonPath.stringAt("$.Rules"),
    });
    disableRuleMap.iterator(disableRule);

    // Whether to wait for the specified number of seconds or until the specified timestamp
    const isTimestamp = new sfn.Choice(this, "isTimestamp")
      .otherwise(waitSeconds)
      .when(
        sfn.Condition.booleanEquals(
          "$$.Execution.Input.WaitTime.isTimestamp",
          true
        ),
        waitTimestamp
      );

    // Whether to enable or disable the EventBridge Rules
    const isEnableRules = new sfn.Choice(this, "isEnableRules")
      .otherwise(disableRuleMap)
      .when(
        sfn.Condition.booleanEquals("$$.Execution.Input.isEnableRules", true),
        enableRuleMap
      );

    waitSeconds.next(listRules);
    waitTimestamp.next(listRules);
    listRules.next(isEnableRules);

    //　State Machine to enable or disable EventBridge Rules
    const enableOrDisableEventBridgeRulesStateMachine = new sfn.StateMachine(
      this,
      "EnableOrDisableEventBridgeRulesStateMachine",
      {
        definition: isTimestamp,
        logs: {
          destination: enableOrDisableEventBridgeRulesStateMachineLogGroup,
          level: sfn.LogLevel.ALL,
        },
        tracingEnabled: true,
        role: enableOrDisableEventBridgeRulesStateMachineIamRole,
      }
    );

    // ----------------------------------
    // State Machine to change the status of EventBridge Rule at once
    // ----------------------------------

    // Step Functions Start Execution Props
    const startExecutionStateMachineToEnableRulesProps: tasks.StepFunctionsStartExecutionProps =
      {
        stateMachine: enableOrDisableEventBridgeRulesStateMachine,
        input: sfn.TaskInput.fromObject({
          "EventBridgeRule.$": "$$.Execution.Input.EventBridgeRule",
          "WaitTime.$": "$$.Execution.Input.EnableWaitTime",
          isEnableRules: true,
        }),
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      };

    const startExecutionStateMachineToDisableRulesProps: tasks.StepFunctionsStartExecutionProps =
      {
        stateMachine: enableOrDisableEventBridgeRulesStateMachine,
        input: sfn.TaskInput.fromObject({
          "EventBridgeRule.$": "$$.Execution.Input.EventBridgeRule",
          "WaitTime.$": "$$.Execution.Input.DisableWaitTime",
          isEnableRules: false,
        }),
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      };

    // Step Functions Start Execution
    const startExecutionStateMachineToEnableRules1 =
      new tasks.StepFunctionsStartExecution(
        this,
        "StartExecutionStateMachineToEnableRules1",
        startExecutionStateMachineToEnableRulesProps
      );

    const startExecutionStateMachineToEnableRules2 =
      new tasks.StepFunctionsStartExecution(
        this,
        "StartExecutionStateMachineToEnableRules2",
        startExecutionStateMachineToEnableRulesProps
      );

    const startExecutionStateMachineToDisableRules1 =
      new tasks.StepFunctionsStartExecution(
        this,
        "StartExecutionStateMachineToDisableRules1",
        startExecutionStateMachineToDisableRulesProps
      );

    const startExecutionStateMachineToDisableRules2 =
      new tasks.StepFunctionsStartExecution(
        this,
        "StartExecutionStateMachineToDisableRules2",
        startExecutionStateMachineToDisableRulesProps
      );

    // Bifurcate on whether to enable then disable or disable then enable
    const isEnableToDisable = new sfn.Choice(this, "isEnableToDisable")
      .otherwise(
        startExecutionStateMachineToDisableRules1.next(
          startExecutionStateMachineToEnableRules2
        )
      )
      .when(
        sfn.Condition.booleanEquals(
          "$$.Execution.Input.isEnableToDisable",
          true
        ),
        startExecutionStateMachineToEnableRules1.next(
          startExecutionStateMachineToDisableRules2
        )
      );

    // State Machine to change the status of EventBridge Rule at once
    new sfn.StateMachine(this, "ChangeStatusEventBridgeRulesStateMachine", {
      definition: isEnableToDisable,
      logs: {
        destination: changeStatusEventBridgeRulesStateMachineLogGroup,
        level: sfn.LogLevel.ALL,
      },
      tracingEnabled: true,
    });
  }
}
