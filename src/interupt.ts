import {
    StateGraph,
    StateSchema,
    START,
    END,
    MemorySaver,
    interrupt,
    Command
} from "@langchain/langgraph";
import { z } from "zod";

const State = new StateSchema({
    action: z.string(),
    status: z.string()
});

const approvalNode = async (state: typeof State.State) => {
    console.log("Dangerous action detected.");

    const decision = interrupt({
        message: "Approval required",
        action: state.action,
        question: "Do you want to continue?"
    });

    console.log("Human decision:", decision);

    if (decision === "approve") {
        return {
            status: "approved"
        };
    }

    return {
        status: "rejected"
    };
};

const executeNode = async (state: typeof State.State) => {
    console.log(" Executing:", state.action);

    return {
        status: "executed"
    };
};

const checkpointer = new MemorySaver();

const graph = new StateGraph(State)
    .addNode("approval", approvalNode)
    .addNode("execute", executeNode)
    .addEdge(START, "approval")
    .addConditionalEdges(
    "approval",
    (state) => state.status,
    {
        approved: "execute",
        rejected: END
    }
)
    .addEdge("execute", END)
    .compile({
        checkpointer
    });

const config = {
    configurable: {
        thread_id: "database-operation-1"
    }
};

const firstResult = await graph.invoke(
    {
        action: "Delete PostgreSQL database",
        status: "pending"
    },
    config
);

console.log("\nFirst result:");
console.log(firstResult);

const resumedResult = await graph.invoke(
    new Command({
        resume: "reject"
    }),
    config
);

console.log("\nAfter approval:");
console.log(resumedResult);