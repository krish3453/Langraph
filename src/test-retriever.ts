import { retriever } from "./qdrant-retriever.js";

const results = await retriever.invoke(
    "Why is my Node.js application getting ECONNREFUSED?"
);

console.log("\n===== RETRIEVED DOCUMENTS =====");

for (const doc of results) {

    console.log("\nContent:");
    console.log(doc.pageContent);

    console.log("\nMetadata:");
    console.log(doc.metadata);
}