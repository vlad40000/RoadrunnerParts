# Document Relevance Workflow

**Description**: A workflow to verify existing documentation in the build chain before creating new documents for delivered tasks.

## Trigger
A process or task has been delivered that requires documentation.

## Steps

1. **Review Delivered Task Requirements**
   - Identify the specific documentation needs for the completed task or process.

2. **Search Existing Build Chain Docs**
   - Search through the existing documentation (e.g., `docs/` folder, `WORKFLOW_STATE.md`, `.agents/policies/`) to find related context or existing documents.
   - Look for terms, components, or systems related to the newly delivered task.

3. **Assess Relevance & Coverage**
   - **If relevant documents exist:** Determine if they should be updated, appended to, or if they already cover the required information. Avoid creating duplicate documents.
   - **If no relevant documents exist:** Proceed with creating a new document, ensuring it is properly linked within the existing documentation architecture.

4. **Update or Create Documentation**
   - Modify existing documents to include the new process/task details.
   - Or, create new documents as required and update relevant indexes or build chain references.
