import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CreateEmailResponse, Resend } from "resend";

const getOcfDAForecastCsv: (source: "wind" | "solar", token: string) => Promise<Response> = async (source, token) => {
  const region = 'ruvnl';
  const url = `${process.env.OCF_API_URL}/${source}/${region}/forecast/csv`;
  return await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
}

const sendQuartzEmail: (resend: Resend, recipients: string[], subject: string, filename: string, content: Buffer) => Promise<CreateEmailResponse> = async (resend, recipients, subject, filename, content) => {
  const html = "<span>Good morning,<br/><br/>" +
    "Find attached the OCF Day Ahead forecast for tomorrow.<br/><br/>" +
    "Kind regards,<br/>" +
    "The Open Climate Fix Team" +
    "<br/><br/><br/></span>";

  return await resend.emails.send({
    from: 'Quartz Energy <notifications@mail.quartz.energy>',
    reply_to: "quartz.support@openclimatefix.org",
    to: recipients,
    subject,
    html,
    attachments: [
      {
        filename,
        content,
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
}

const checkEmailResponse = (message: string, source: "Wind" | "Solar", resendResult: CreateEmailResponse, recipients: string[]) => {
  if (resendResult.error) {
    console.log(`${source} email not sent`);
    console.log(resendResult.error);
    message += resendResult.error
    message += " \n---\n "
  } else {
    if (recipients.length === 1) {
      message += `${source} email sent to ${recipients[0]}`
    } else {
      message += `${source} emails sent to `
      for (const i in recipients) {
        const email = recipients[i];
        console.log(`${source} email sent to ${email}`);
        if (Number(i) === recipients.length - 1) {
          message += `and ${email}`
        } else {
          message += `${email}, `
        }
      }
    }
    message += " \n---\n "
    console.log(`${source} Resend response: `, resendResult.data);
  }
  return message;
};

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

  // Get OCF wind forecast CSV file
  const windForecastCsvRes = await getOcfDAForecastCsv("wind", tokenData.access_token)
  if (!windForecastCsvRes.ok) {
    const error = await windForecastCsvRes.text();
    console.log(error);
    response.send(`OCF wind forecast CSV fetch error: ${error}`);
    return;
  }
  console.log("OCF wind forecast received, preparing CSV")

  // Get OCF solar forecast CSV file
  const solarForecastCsvRes = await getOcfDAForecastCsv("solar", tokenData.access_token)
  if (!solarForecastCsvRes.ok) {
    const error = await solarForecastCsvRes.text();
    console.log(error);
    response.send(`OCF solar forecast CSV fetch error: ${error}`);
    return;
  }
  console.log("OCF solar forecast received, preparing CSV")

  // Convert CSVs ready for emails
  const [, windFilename] = windForecastCsvRes.headers.get('Content-Disposition')?.split('filename=') || ["", ""];
  const windForecastCsv = await windForecastCsvRes.text();
  const windForecastBuffer = Buffer.from(windForecastCsv, 'utf-8');

  const [, solarFilename] = solarForecastCsvRes.headers.get('Content-Disposition')?.split('filename=') || ["", ""];
  const solarForecastCsv = await solarForecastCsvRes.text();
  const solarForecastBuffer = Buffer.from(solarForecastCsv, 'utf-8');

  console.log("CSVs ready, sending emails")

  // Prep and send emails
  const resend = new Resend(process.env.RESEND_API_KEY);

  const recipients = process.env.EMAIL_RECIPIENTS?.includes(",")
    ? process.env.EMAIL_RECIPIENTS.split(",")
    : [process.env.EMAIL_RECIPIENTS || ""];
  console.log("recipients", recipients)
  const windResendRes = await sendQuartzEmail(resend, recipients, "DA Forecast – Wind", windFilename, windForecastBuffer)
  const solarResendRes = await sendQuartzEmail(resend, recipients, "DA Forecast – Solar", solarFilename, solarForecastBuffer)

  // Check if wind emails sent successfully and append to results message
  let message = "";
  message = checkEmailResponse(message, "Wind", windResendRes, recipients);
  // Check if solar emails sent successfully and append to results message
  message = checkEmailResponse(message, "Solar", solarResendRes, recipients);
  // Return results message
  console.log(message);
  response.send(message);
}
