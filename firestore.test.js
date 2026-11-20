const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");

let testEnv;
const PROJECT_ID = process.env.GCP_PROJECT || "demo-no-project";
const ALICE_UID = "alice_123";
const BOB_UID = "bob_456";

const [emulatorHost, emulatorPortStr] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");
const emulatorPort = parseInt(emulatorPortStr, 10);

before(async () => {
  const rules = fs.readFileSync("./firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: emulatorHost,
      port: emulatorPort,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

test("Unauthenticated user: cannot read or create tasks, classes, or exams", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(unauthDb.collection("tasks").get());
  await assertFails(unauthDb.collection("classes").get());
  await assertFails(unauthDb.collection("exams").get());
});

test("Authenticated user: can create and query their own tasks, classes, and exams", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const now = new Date(Date.now() - 1000);

  await assertSucceeds(
    aliceDb.collection("tasks").doc("task_1").set({
      ownerId: ALICE_UID,
      title: "Linear Algebra Problem Set 4",
      subject: "Mathematics",
      dueDate: "2026-10-30",
      priority: "high",
      progress: 40,
      status: "pending",
      source: "manual",
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    aliceDb.collection("classes").doc("class_1").set({
      ownerId: ALICE_UID,
      subject: "Distributed Systems",
      day: "Monday",
      time: "09:00 - 10:30",
      room: "Gates Hall 310",
      teacher: "Prof. K. Lamport",
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    aliceDb.collection("exams").doc("exam_1").set({
      ownerId: ALICE_UID,
      title: "Midterm Assessment",
      subject: "Distributed Systems",
      date: "2026-11-12",
      time: "14:00",
      room: "Auditorium B",
      weight: 30,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(aliceDb.collection("tasks").where("ownerId", "==", ALICE_UID).get());
  await assertSucceeds(aliceDb.collection("classes").where("ownerId", "==", ALICE_UID).get());
  await assertSucceeds(aliceDb.collection("exams").where("ownerId", "==", ALICE_UID).get());
});

test("Authenticated user: cannot read or modify another user's documents", async () => {
  const now = new Date(Date.now() - 1000);
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("tasks").doc("bob_task").set({
      ownerId: BOB_UID,
      title: "Bob's Secret Assignment",
      subject: "Physics",
      dueDate: "2026-10-28",
      priority: "medium",
      progress: 0,
      status: "pending",
      source: "manual",
      createdAt: now,
      updatedAt: now,
    });
  });

  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  await assertFails(aliceDb.collection("tasks").doc("bob_task").get());
  await assertFails(aliceDb.collection("tasks").doc("bob_task").delete());
});

test("Terminal state lock: completed task cannot be updated", async () => {
  const now = new Date(Date.now() - 2000);
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("tasks").doc("done_task").set({
      ownerId: ALICE_UID,
      title: "Completed Lab Report",
      subject: "Chemistry",
      dueDate: "2026-10-25",
      priority: "low",
      progress: 100,
      status: "completed",
      source: "manual",
      createdAt: now,
      updatedAt: now,
    });
  });

  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  await assertFails(
    aliceDb.collection("tasks").doc("done_task").update({
      progress: 50,
      status: "pending",
      updatedAt: new Date(Date.now() - 500),
    })
  );
});

test("Dirty Dozen: rejects ghost fields, invalid priority, and missing ownerId filter", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const now = new Date(Date.now() - 1000);

  await assertFails(
    aliceDb.collection("tasks").doc("bad_task_1").set({
      ownerId: ALICE_UID,
      title: "Invalid Priority Task",
      subject: "CS",
      dueDate: "2026-10-30",
      priority: "critical",
      progress: 0,
      status: "pending",
      source: "manual",
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertFails(
    aliceDb.collection("tasks").doc("bad_task_2").set({
      ownerId: ALICE_UID,
      title: "Ghost Field Task",
      subject: "CS",
      dueDate: "2026-10-30",
      priority: "high",
      progress: 0,
      status: "pending",
      source: "manual",
      isAdmin: true,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertFails(aliceDb.collection("tasks").get());
});
