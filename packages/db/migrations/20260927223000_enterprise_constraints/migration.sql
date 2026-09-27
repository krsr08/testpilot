ALTER TABLE "Project" ADD CONSTRAINT "Project_lifecycle_check" CHECK ("lifecycle" IN ('ACTIVE','ON_HOLD','COMPLETED','ARCHIVED'));
ALTER TABLE "Project" ADD CONSTRAINT "Project_visibility_check" CHECK ("visibility" IN ('PRIVATE','WORKSPACE'));
ALTER TABLE "Project" ADD CONSTRAINT "Project_risk_check" CHECK ("risk" IN ('LOW','MEDIUM','HIGH','CRITICAL'));
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_role_check" CHECK ("role" IN ('MANAGER','CONTRIBUTOR','VIEWER'));
ALTER TABLE "TestPlan" ADD CONSTRAINT "TestPlan_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','COMPLETED','ARCHIVED'));
ALTER TABLE "TestCycle" ADD CONSTRAINT "TestCycle_status_check" CHECK ("status" IN ('PLANNED','ACTIVE','COMPLETED','ABORTED'));
ALTER TABLE "TestExecution" ADD CONSTRAINT "TestExecution_status_check" CHECK ("status" IN ('NOT_RUN','PASSED','FAILED','BLOCKED','SKIPPED'));
