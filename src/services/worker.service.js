const { Worker } = require("bullmq");
const { createQueueConnection } = require("../config/queues");
const { sendEmailNow } = require("./email.service");
const { applyDeadStockDecayForTenant, releaseExpiredReservationsForTenant } = require("./inventory.service");

const workers = [];

function startWorkers() {
  const emailWorker = new Worker("email", async (job) => {
    return sendEmailNow(job.data);
  }, { connection: createQueueConnection(), concurrency: 5 });

  emailWorker.on("completed", (job) => {
    console.log("[email:sent]", {
      jobId: job.id,
      to: job.data.to,
      subject: job.data.subject,
      eventType: job.data.eventType,
    });
  });

  emailWorker.on("failed", (job, error) => {
    console.error("[email:failed]", {
      jobId: job?.id,
      to: job?.data?.to,
      subject: job?.data?.subject,
      eventType: job?.data?.eventType,
      message: error.message,
    });
  });

  const maintenanceWorker = new Worker("maintenance", async (job) => {
    if (job.name === "dead-stock-decay") {
      return applyDeadStockDecayForTenant({
        tenantId: job.data.tenantId,
        actorUserId: null,
        now: job.data.now ? new Date(job.data.now) : new Date(),
      });
    }
    if (job.name === "release-expired-reservations") {
      return releaseExpiredReservationsForTenant({
        tenantId: job.data.tenantId,
        now: job.data.now ? new Date(job.data.now) : new Date(),
      });
    }
    throw new Error(`Unknown maintenance job: ${job.name}`);
  }, { connection: createQueueConnection(), concurrency: 2 });

  workers.push(emailWorker, maintenanceWorker);
  console.log("BullMQ workers started: email, maintenance");
}

async function stopWorkers() {
  await Promise.all(workers.map((worker) => worker.close()));
  workers.length = 0;
}

module.exports = { startWorkers, stopWorkers };
