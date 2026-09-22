import "dotenv/config";

import { z } from "zod";
import {
    StateGraph,
    StateSchema,
    START,
    END
} from "@langchain/langgraph";

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";


// -------------------------
// STATE
// -------------------------

const State = new StateSchema({
    question: z.string(),
    retrievedInfo: z.string(),
    enoughInformation: z.boolean(),
    attempts: z.number(),
    answer: z.string()
});


// -------------------------
// MODEL
// -------------------------

const model = new ChatGoogleGenerativeAI({
    model: "gemini-3.5-flash-lite",
    temperature: 0
});


// -------------------------
// EVALUATOR
// -------------------------

const EvaluationSchema = z.object({
    enoughInformation: z.boolean(),
    reason: z.string()
});

const evaluator = model.withStructuredOutput(
    EvaluationSchema
);


// -------------------------
// RETRIEVE NODE
// -------------------------

const retrieveNode = async (
    state: typeof State.State
) => {

    const nextAttempt = state.attempts + 1;

    console.log("\n--- RETRIEVE NODE ---");
    console.log("Attempt:", nextAttempt);

    let information = "";

    if (nextAttempt === 1) {

        information = `
        PostgreSQL is a database.
        `;

    } else {

        information = `
        PostgreSQL normally listens on port 5432.
        ECONNREFUSED means the application could not establish
        a TCP connection to the target host and port.

        Common causes include:
        - PostgreSQL is not running.
        - The host is incorrect.
        - The port is incorrect.
        - Docker networking is configured incorrectly.
        `;

    }

    return {
        retrievedInfo: information,
        attempts: nextAttempt
    };
};


// -------------------------
// EVALUATE NODE
// -------------------------

const evaluateNode = async (
    state: typeof State.State
) => {

    console.log("\n--- EVALUATE NODE ---");

    const result = await evaluator.invoke([
        {
            role: "system",
            content:
                "Determine whether the retrieved information is sufficient to answer the user's question. Return true only when it provides enough useful information."
        },
        {
            role: "user",
            content: `
Question:
${state.question}

Retrieved information:
${state.retrievedInfo}
`
        }
    ]);

    console.log(
        "Enough information:",
        result.enoughInformation
    );

    console.log(
        "Reason:",
        result.reason
    );

    return {
        enoughInformation: result.enoughInformation
    };
};


// -------------------------
// GENERATE NODE
// -------------------------

const generateNode = async (
    state: typeof State.State
) => {

    console.log("\n--- GENERATE NODE ---");

    const response = await model.invoke([
        {
            role: "system",
            content:
                "Answer the user's technical question using the retrieved information. Be practical and concise."
        },
        {
            role: "user",
            content: `
Question:
${state.question}

Retrieved information:
${state.retrievedInfo}
`
        }
    ]);

    return {
        answer: response.content.toString()
    };
};


// -------------------------
// GRAPH
// -------------------------

const graph = new StateGraph(State)

    .addNode("retrieve", retrieveNode)

    .addNode("evaluate", evaluateNode)

    .addNode("generate", generateNode)

    .addEdge(START, "retrieve")

    .addEdge("retrieve", "evaluate")

    .addConditionalEdges(
        "evaluate",

        (state) => {

            // Information is sufficient
            if (state.enoughInformation) {
                return "enough";
            }

            // Not enough information,
            // but we can still retry
            if (state.attempts < 3) {
                return "retry";
            }

            // Maximum attempts reached
            return "max_attempts";
        },

        {
            enough: "generate",
            retry: "retrieve",
            max_attempts: "generate"
        }
    )

    .addEdge("generate", END)

    .compile();


// -------------------------
// RUN
// -------------------------

const result = await graph.invoke({
    question:
        "Why is my Node.js API getting ECONNREFUSED from PostgreSQL?",

    retrievedInfo: "",

    enoughInformation: false,

    attempts: 0,

    answer: ""
});


console.log("\n===== FINAL STATE =====");

console.log(result);