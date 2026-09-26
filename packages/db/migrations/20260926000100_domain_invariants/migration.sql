ALTER TABLE "Requirement" ADD CONSTRAINT "requirement_nonblank" CHECK (length(trim(text)) > 0);
ALTER TABLE "SourceDocument" ADD CONSTRAINT "source_size_limit" CHECK (size >= 0 AND size <= 10485760);
ALTER TABLE "TestStep" ADD CONSTRAINT "step_positive_position" CHECK (position >= 1);
ALTER TABLE "TestCase" ADD CONSTRAINT "case_type" CHECK (type IN ('positive', 'negative', 'boundary', 'permission', 'other'));
ALTER TABLE "TestCase" ADD CONSTRAINT "case_status" CHECK (status IN ('draft', 'approved', 'rejected'));
ALTER TABLE "Job" ADD CONSTRAINT "job_progress" CHECK (progress >= 0 AND progress <= 100);
ALTER TABLE "SourceCitation" ADD CONSTRAINT "citation_grounded_or_inferred" CHECK (inferred OR ("sourceId" IS NOT NULL AND locator <> '{}'::jsonb AND locator <> 'null'::jsonb));

CREATE FUNCTION forbid_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'History rows are immutable';
END;
$$;

CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE ON "RequirementSnapshot"
FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE TRIGGER immutable_requirement_revision BEFORE UPDATE OR DELETE ON "RequirementRevision"
FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE TRIGGER immutable_case_revision BEFORE UPDATE OR DELETE ON "TestCaseRevision"
FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();

CREATE FUNCTION require_same_project_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT "projectId" FROM "Requirement" WHERE id = NEW."requirementId")
     IS DISTINCT FROM
     (SELECT "projectId" FROM "TestCase" WHERE id = NEW."testCaseId") THEN
    RAISE EXCEPTION 'Requirement and test case must belong to the same project';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER same_project_link BEFORE INSERT OR UPDATE ON "RequirementCaseLink"
FOR EACH ROW EXECUTE FUNCTION require_same_project_link();
