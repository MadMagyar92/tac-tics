import { type ActionInput, type ActionOutput, type ActionPlan, type ActionResult, BaseActionService } from "@tac-tics/api";
import { describe, expect, it } from "vitest";

type TestInput = ActionInput & { plannable: boolean };
type TestPlan = ActionPlan & { value: number };
type TestResult = ActionResult & { value: number };
type TestOutput = ActionOutput & { value: number };

const definition = { scope: "action", name: "test" };

/** A service that doubles the value of its plan into its result, and remembers each stage it runs, in order. */
class StageRecorder extends BaseActionService<TestInput, TestPlan, TestResult, TestOutput> {
  stages: string[] = [];

  plan(actionInput: TestInput): TestPlan | undefined {
    this.stages.push("plan");
    return actionInput.plannable ? { definition, value: 1 } : undefined;
  }

  preview({ value }: TestPlan): TestResult {
    this.stages.push("preview");
    return { value: value * 2 };
  }

  commit({ value }: TestResult): TestOutput {
    this.stages.push("commit");
    return { definition, value };
  }
};

describe("BaseActionService", () => {
  it("executes by previewing the plan, then committing its result", () => {
    const service = new StageRecorder();

    expect(service.execute({ definition, value: 1 })).toEqual({ definition, value: 2 });
    expect(service.stages).toEqual(["preview", "commit"]);
  });

  it("plans nothing when executing: planning is up to the caller", () => {
    const service = new StageRecorder();

    service.execute({ definition, value: 1 });

    expect(service.stages).not.toContain("plan");
  });
});
