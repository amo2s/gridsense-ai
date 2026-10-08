const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiZmU5NDJmNzctYTZhNC00MDQxLWIxMDUtNjVkMDUwMjQ2MjdkIiwiZW1haWwiOiJud2FrYWFtb3M5NUBnbWFpbC5jb20iLCJuYW1lIjoiQW1vcyBOd2FrYSIsInJvbGUiOiJBZG1pbiIsInN0YXR1cyI6IkFwcHJvdmVkIiwiaXNzIjoiZ3JpZHNlbnNlLWF1dGgtc2VydmljZSIsInN1YiI6ImZlOTQyZjc3LWE2YTQtNDA0MS1iMTA1LTY1ZDA1MDI0NjI3ZCIsImV4cCI6MTc5MTM3MDg3MiwiaWF0IjoxNzkxMzY5OTcyfQ.UXMKBuOxxLXE1vEIrRii26ycoju59Hzn1eMqRIlpTyg';

async function test() {
  const r = await fetch('http://localhost:3000/api/proxy/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `auth_token=${token}`
    },
    body: JSON.stringify({
      query: `query DashboardSummary($timeRange: String!) { dashboardSummary(timeRange: $timeRange) { overallReliabilityScore } }`,
      variables: { timeRange: '24h' }
    })
  });
  console.log(r.status);
  console.log(await r.text());
}
test();
