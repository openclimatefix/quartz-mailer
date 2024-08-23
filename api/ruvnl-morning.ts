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

// function to incrementally convert an array of strings into a list of objects in a sentence, one at a time
// e.g. (item, itemIndex, listLength, message) => message = "a", message = "a and b", message = "a, b, and c"
// if the list is empty, the message will be ""
const buildMessageFromList = (item: string, itemIndex: string, listLength: number, message: string) => {
  // List only contains one item
  if (listLength === 1) {
    return `${message} ${item}`;
  }
  // First item in list
  if (itemIndex === "0") {
    return `${message} ${item}`;
  }
  // Last item in list
  if (Number(itemIndex) === listLength - 1) {
    return `${message} and ${item}`;
  }
  // Middle item in list
  return `${message}, ${item}`;
}


const sendQuartzEmail: (resend: Resend, recipient: string, subject: string, filename: string, content: Buffer) => Promise<CreateEmailResponse> = async (resend, recipient, subject, filename, content) => {
  const html = "<span>Good morning,<br/><br/>" +
    "Find attached the OCF Day Ahead forecast for tomorrow.<br/><br/>" +
    "Kind regards,<br/>" +
    "The Open Climate Fix Team" +
    "<br/><br/><br/></span>";

  return await resend.emails.send(
    {
      from: 'Quartz Energy <notifications@mail.quartz.energy>',
      reply_to: "quartz.support@openclimatefix.org",
      to: recipient,
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
    }
  );
}

const checkEmailsSentAndBuildMessage = (message: string, source: "Wind" | "Solar", resendResult: CreateEmailResponse, recipient: string, recipientsLength: number, currentIndex: string) => {
  if (resendResult.error) {
    console.log(`${source} email not sent`);
    console.log(resendResult.error.message);
    message += resendResult.error.message;
    message += " \n---\n ";
  } else {
    message = buildMessageFromList(recipient, currentIndex, recipientsLength, message);
    console.log(`${source} Resend response: `, resendResult.data);
  }
  return message;
};

const getTomorrowDateString: () => string = () => {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

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
  let windMessage = `Wind emails sent to`;
  let solarMessage = "Solar emails sent to";
  const tomorrowDateString = getTomorrowDateString();

  // Send a separate email to each person, rather than one email to everyone
  // Firstly, so recipients can't see each other's email addresses,
  // and secondly, so we can track which emails were delivered and opened (mostly)
  for (const [index, recipient] of Object.entries(recipients)) {
    console.log(`Sending to ${recipient}`)
    // Wind Email
    const windResendRes = await sendQuartzEmail(resend, recipient, `DA Wind Forecast for ${tomorrowDateString}`, windFilename, windForecastBuffer)
    // Check if wind emails sent successfully and append to results message
    windMessage = checkEmailsSentAndBuildMessage(windMessage, "Wind", windResendRes, recipient, recipients.length, index);

    // Solar Email
    const solarResendRes = await sendQuartzEmail(resend, recipient, `DA Solar Forecast for ${tomorrowDateString}`, solarFilename, solarForecastBuffer)
    // Check if solar emails sent successfully and append to results message
    solarMessage = checkEmailsSentAndBuildMessage(solarMessage, "Solar", solarResendRes, recipient, recipients.length, index);

    // Wait 2 seconds between sending emails to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Return results message
  console.log(windMessage);
  console.log(solarMessage);
  response.send(`${windMessage} \n---\n ${solarMessage}`);
}
