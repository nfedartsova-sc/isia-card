export type ISIACardResponseData = {
  isiaCode: string,
  name: string;
  title: string;
  countryCode: string;
  association: string;
  membershipNo: string;
  webSite: string;
  expirationDate: Date;
}
 
export function GET(
  _request: Request
) {
  const data = {
    isiaCode: 'AB67L',
    name: 'Nico Müller',
    title: 'National Ski Teacher Level 3',
    countryCode: 'ie',
    association: 'Irish Association of Snowsports Instructors',
    membershipNo: '0632',
    webSite: 'https://iasisnowsports.ie/',
    expirationDate: new Date(2026, 5, 15),
  };
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
