import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { executeRulePack } from "../engine/executor.js";

const jobs = new Map<string, cron.ScheduledTask>();

export function startScheduler() {
  // Reload schedules every minute and ensure enabled jobs are registered
  cron.schedule("* * * * *", async () => {
    try {
      const schedules = await prisma.ruleSchedule.findMany({
        where: { enabled: true },
        include: { rulePack: true },
      });

      const activeIds = new Set(schedules.map((s) => s.id));

      for (const [id, task] of jobs) {
        if (!activeIds.has(id)) {
          task.stop();
          jobs.delete(id);
        }
      }

      for (const s of schedules) {
        if (jobs.has(s.id)) continue;
        if (!cron.validate(s.cron)) {
          console.warn(`Invalid cron for schedule ${s.id}: ${s.cron}`);
          continue;
        }
        const task = cron.schedule(s.cron, async () => {
          console.log(`Running scheduled pack ${s.rulePackId}`);
          try {
            await executeRulePack({
              rulePackId: s.rulePackId,
              clientId: s.clientId,
              mode: "APPLY",
            });
            await prisma.ruleSchedule.update({
              where: { id: s.id },
              data: { lastRunAt: new Date() },
            });
          } catch (e) {
            console.error(`Schedule ${s.id} failed`, e);
          }
        });
        jobs.set(s.id, task);
        console.log(`Registered schedule ${s.name} (${s.cron})`);
      }
    } catch (e) {
      // DB may not be ready on first boot
      console.warn("Scheduler tick skipped", (e as Error).message);
    }
  });
}
