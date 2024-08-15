import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from "resend";

export default async function (request: VercelRequest, response: VercelResponse) {
  // Validate request is authorized
  // Vercel will automatically add this header from the env variable
  const {authorization} = request.headers;
  const cronToken = authorization || "";
  if (!cronToken) {
    response.status(403).send("Token missing");
    return;
  }
  if (cronToken !== `Bearer ${process.env.CRON_SECRET}`) {
    response.status(403).send("Token invalid");
    return;
  }

  console.log('Getting OCF forecast');
  // Get OCF login token
  type TokenResponse = {
    access_token: string;
    scope: string;
    expires_in: number;
    token_type: string;
  }
  const tokenRes = await fetch(`${process.env.AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: process.env.AUTH0_USERNAME,
      password: process.env.AUTH0_PASSWORD,
      client_id: process.env.AUTH0_CLIENT_ID,
      audience: process.env.AUTH0_AUDIENCE,
      grant_type: "password",
    }),
  });
  if (!tokenRes.ok) {
    const error = await tokenRes.text();
    console.log(error);
    response.send(`OCF token error: ${error}`);
    return;
  }
  const tokenData: TokenResponse = await tokenRes.json();
  console.log(tokenData);

  // Get OCF forecast CSV file
  const source = 'wind';
  const region = 'ruvnl';
  const url = `${process.env.OCF_API_URL}/${source}/${region}/forecast/csv`;
  console.log("url", url);
  const forecastCsvRes = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenData.access_token}`,
    },
  });
  if (!forecastCsvRes.ok) {
    const error = await forecastCsvRes.text();
    console.log(error);
    response.send(`OCF forecast CSV error: ${error}`);
    return;
  }

  console.log("OCF forecast received, preparing CSV")

  // Convert csv ready for email
  const [, filename] = forecastCsvRes.headers.get('Content-Disposition')?.split('filename=') || ["", ""];
  const forecastCsv = await forecastCsvRes.text();
  const forecastBuffer = Buffer.from(forecastCsv, 'utf-8');

  console.log("CSV ready, sending email")

  // Prep and send email
  const resend = new Resend(process.env.RESEND_API_KEY);

  const html = "<span>Good morning,<br/><br/>" +
    "Find attached the OCF Day Ahead forecast for tomorrow.<br/><br/>" +
    "Kind regards,<br/>" +
    "The Open Climate Fix Team" +
    "<br/><br/><br/></span>";

  const resendRes = await resend.emails.send({
    from: 'Quartz Energy <notifications@mail.quartz.energy>',
    reply_to: "quartz.support@openclimatefix.org",
    to: [process.env.EMAIL_RECIPIENT || ""],
    subject: 'Day Ahead Forecast – Wind',
    html,
    attachments: [
      {
        filename: filename,
        content: forecastBuffer,
        content_type: 'text/csv; charset="UTF-8"',
      },
    ],
    tags: [
      {
        name: 'category',
        value: 'ruvnl_email',
      },
    ],
  });

  if (resendRes.error) {
    console.log('Email not sent');
    console.log(resendRes.error);
    response.send(resendRes.error);
    return;
  } else {
    console.log(`Email sent to ${process.env.EMAIL_RECIPIENT}`);
    console.log("Resend response: ", resendRes.data);
    response.send('Email sent');
  }
}
