import 'server-only';
import { JobPacket, AgentResult } from './types';
import { 
  discoverDiagramGroupsForJob, 
  extractAllDiagramGroupsForJob 
} from '../grouped-bom';
import { getBomJob } from '../../services/job-store';

export async function runGroupDiagramAgent(packet: JobPacket): Promise<AgentResult> {
  const jobId = packet.jobId;

  try {
    // 1. Discover Groups (if not already discovered)
    await discoverDiagramGroupsForJob({
      jobId,
      identity: {
        brand: packet.brand || undefined,
        model: packet.model,
        serial: packet.serial || undefined,
        productType: packet.type || undefined,
        familyKey: packet.manufacturerFamily || undefined,
        confidence: packet.ocrConfidence,
      }
    });

    // 2. Extract All Groups
    const bulkResult = await extractAllDiagramGroupsForJob({
      jobId,
      concurrency: 5
    });

    const job = bulkResult.job;
    const groups = bulkResult.groups;

    return {
      agent: 'group_diagram',
      status: bulkResult.isComplete ? 'success' : 'partial',
      source: 'multi-distributor-diagrams',
      groupsRun: groups.length,
      newUniqueRows: job.uniqueRowCount,
      coverageAfterMerge: job.coveragePct,
      notes: [`Processed ${groups.length} diagram groups. Final unique parts: ${job.uniqueRowCount}.`],
    };
  } catch (error) {
    return {
      agent: 'group_diagram',
      status: 'failed',
      source: 'multi-distributor-diagrams',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
