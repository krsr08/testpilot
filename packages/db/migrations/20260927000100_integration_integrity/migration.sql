ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalCaseLink" ADD CONSTRAINT "ExternalCaseLink_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalCaseLink" ADD CONSTRAINT "ExternalCaseLink_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
