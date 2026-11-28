// The agent-charge suite again with OAuth access tokens (cvs_oat_) in place of personal access tokens: an OAuth connection must behave exactly like a PAT.
process.env.CVS_TEST_AGENT_KIND = 'oauth';
await import('./agent-charge.test');
