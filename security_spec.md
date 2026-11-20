# Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Authentication Invariant**: Every read and write operation across `/tasks/{taskId}`, `/classes/{classId}`, and `/exams/{examId}` requires an authenticated user (`request.auth != null`).
2. **Strict Ownership Invariant**: Every document in `/tasks`, `/classes`, and `/exams` is strictly private to `ownerId == request.auth.uid`. Cross-user reads (`get`, `list`) and writes (`create`, `update`, `delete`) are strictly forbidden.
3. **Immutable Provenance Invariant**: `ownerId` and `createdAt` can never be mutated during an `update` (`incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt`).
4. **Temporal Integrity Invariant**: On `create`, `createdAt` and `updatedAt` must be valid server timestamps (`<= request.time`). On `update`, `updatedAt` must be a valid server timestamp (`<= request.time`).
5. **Terminal State Locking Invariant**: Once a task reaches `status == 'completed'`, subsequent updates to that document are locked (`existing().status != 'completed'`).
6. **Path ID & Schema Boundary Invariant**: All document IDs (`taskId`, `classId`, `examId`) must match `^[a-zA-Z0-9_\-]+$` with length `1..128`. Every string field has strict `.size()` bounds and regex validation matching `firebase-blueprint.json`.

---

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 (Identity Spoofing on Create)**: Creating a `/tasks/task_1` document where `ownerId: "victim_uid"` while authenticated as `"attacker_uid"`.
2. **Payload 2 (Unauthenticated Read/Write)**: Reading or creating `/tasks/task_2` without authentication.
3. **Payload 3 (Shadow / Ghost Field Injection)**: Updating `/tasks/task_1` with `{ title: "Updated", isAdmin: true }`.
4. **Payload 4 (Path ID Poisoning)**: Creating `/tasks/invalid$id!@#` containing illegal characters outside `^[a-zA-Z0-9_\-]+$`.
5. **Payload 5 (Denial-of-Wallet Oversized String)**: Creating `/tasks/task_3` with a `title` of 5,000 characters (`> 200`).
6. **Payload 6 (Future Timestamp Forgery on Create)**: Creating `/classes/class_1` with a future `createdAt` timestamp (`> request.time`).
7. **Payload 7 (Immutable Field Mutation)**: Updating `/classes/class_1` to change `ownerId` or `createdAt`.
8. **Payload 8 (Terminal State Mutation)**: Updating `/tasks/task_completed` after `existing().status == 'completed'`.
9. **Payload 9 (Invalid Enum Value)**: Creating `/tasks/task_4` with `priority: "critical"` (not in `['high', 'medium', 'low']`).
10. **Payload 10 (Out-of-Range Integer)**: Updating `/exams/exam_1` with `weight: 250` (`> 100`) or `progress: -10`.
11. **Payload 11 (Cross-User Read/List Scraping)**: Querying `/tasks` without `where('ownerId', '==', request.auth.uid)` or reading another user's `/exams/exam_other`.
12. **Payload 12 (Malformed Date Pattern)**: Creating `/exams/exam_2` with `date: "23-10-2026"` (fails `^[0-9]{4}-[0-9]{2}-[0-9]{2}$`).
