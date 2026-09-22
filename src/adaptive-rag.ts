import "dotenv/config";

import {
    StateGraph,
    StateSchema,
    START,
    END
} from "@langchain/langgraph";

import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

import { retriever } from "./qdrant-retriever.js";


// ========================================
// 1. Graph State
// ========================================

const State = new StateSchema({
    question: z.string(),

    // Query currently being sent to Qdrant
    searchQuery: z.string(),

    // Retrieved documents converted to text
    retrievedInfo: z.string(),

    // LLM evaluation
    enoughInformation: z.boolean(),

    // Number of retrieval attempts
    attempts: z.number(),

    // Final answer
    answer: z.string()
});


// ========================================
// 2. Gemini Model
// ========================================

const model = new ChatGoogleGenerativeAI({
    model: "gemini-3.5-flash-lite",
    temperature: 0
});


// ========================================
// 3. Retrieve Node
// ========================================

const retrieveNode = async (state: typeof State.State) => {

    console.log(`\n🔍 Retrieval attempt ${state.attempts + 1}`);
    console.log(`Search query: ${state.searchQuery}`);

    const docs = await retriever.invoke(state.searchQuery);

    const retrievedInfo = docs
        .map((doc, index) => {
            return `Document ${index + 1}:\n${doc.pageContent}`;
        })
        .join("\n\n");

    console.log(`Retrieved ${docs.length} documents.`);

    return {
        retrievedInfo,
        attempts: state.attempts + 1
    };
};


// ========================================
// 4. Evaluate Retrieved Information
// ========================================

const EvaluationSchema = z.object({
    enoughInformation: z.boolean(),
    reason: z.string()
});

const evaluator = model.withStructuredOutput(EvaluationSchema);


const evaluateNode = async (state: typeof State.State) => {

    console.log("\n🧠 Evaluating retrieved information...");

    const result = await evaluator.invoke([
        {
            role: "system",
            content: `
You evaluate whether retrieved technical documentation
contains enough information to answer the user's question.

Return enoughInformation = true only when the retrieved
information provides enough useful information to answer
the question accurately.

Otherwise return false.
`
        },
        {
            role: "user",
            content: `
User Question:
${state.question}

Retrieved Information:
${state.retrievedInfo}
`
        }
    ]);

    console.log(`Enough information: ${result.enoughInformation}`);
    console.log(`Reason: ${result.reason}`);

    return {
        enoughInformation: result.enoughInformation
    };
};


// ========================================
// 5. Rewrite Search Query
// ========================================

const QuerySchema = z.object({
    searchQuery: z.string()
});

const queryRewriter = model.withStructuredOutput(QuerySchema);


const rewriteQueryNode = async (state: typeof State.State) => {

    console.log("\n✏️ Rewriting search query...");

    const result = await queryRewriter.invoke([
        {
            role: "system",
            content: `
You rewrite technical questions into better search queries
for a vector database.

The goal is to retrieve highly relevant technical documentation.

Keep the query concise and include important technical
terms such as technologies, errors, libraries, protocols,
or database names when relevant.
`
        },
        {
            role: "user",
            content: `
Original user question:
${state.question}

Previous search query:
${state.searchQuery}

Retrieved information:
${state.retrievedInfo}

The retrieved information was insufficient.

Create a better search query.
`
        }
    ]);

    console.log(`New search query: ${result.searchQuery}`);

    return {
        searchQuery: result.searchQuery
    };
};


// ========================================
// 6. Generate Final Answer
// ========================================

const generateNode = async (state: typeof State.State) => {

    console.log("\n🤖 Generating final answer...");

    const response = await model.invoke([
        {
            role: "system",
            content: `
You are a technical support assistant.

Answer the user's question using the retrieved information.

Do not invent technical facts that are not supported
by the retrieved information.

If the information is still insufficient, clearly say so.
`
        },
        {
            role: "user",
            content: `
Question:
${state.question}

Retrieved Information:
${state.retrievedInfo}
`
        }
    ]);

    return {
        answer: response.content.toString()
    };
};


// ========================================
// 7. Decide What Happens After Evaluation
// ========================================

const routeAfterEvaluation = (
    state: typeof State.State
) => {

    if (state.enoughInformation) {
        return "generate";
    }

    if (state.attempts < 3) {
        return "rewrite";
    }

    return "generate";
};


// ========================================
// 8. Build Graph
// ========================================

const graph = new StateGraph(State)

    .addNode("retrieve", retrieveNode)
    .addNode("evaluate", evaluateNode)
    .addNode("rewrite", rewriteQueryNode)
    .addNode("generate", generateNode)

    .addEdge(START, "retrieve")

    .addEdge("retrieve", "evaluate")

    .addConditionalEdges(
        "evaluate",
        routeAfterEvaluation,
        {
            generate: "generate",
            rewrite: "rewrite"
        }
    )

    .addEdge("rewrite", "retrieve")

    .addEdge("generate", END)

    .compile();


// ========================================
// 9. Run Graph
// ========================================

const result = await graph.invoke({
    question: "Why is my Node.js application getting ECONNREFUSED?",

    searchQuery:
        "Node.js ECONNREFUSED connection refused error",

    retrievedInfo: "",

    enoughInformation: false,

    attempts: 0,

    answer: ""
});


// ========================================
// 10. Final Output
// ========================================

console.log("\n================================");
console.log("FINAL ANSWER");
console.log("================================\n");

console.log(result.answer);

console.log("\n================================");
console.log("GRAPH STATS");
console.log("================================");

console.log(`Attempts: ${result.attempts}`);
console.log(`Final search query: ${result.searchQuery}`);
