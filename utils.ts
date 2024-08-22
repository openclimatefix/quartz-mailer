import { CreateEmailResponse } from "resend";


/**
 * Builds a message string by appending items from a list based on their position.
 * Handles special cases for an empty list, single item list, first item, last item,
 * and items in between, adding appropriate punctuation and conjunctions.
 *
 * @param item - The current item to append to the message.
 * @param itemIndex - The index of the current item in string format.
 * @param listLength - The total number of items in the list.
 * @param message - The message string being built.
 * @returns The updated message string with the current item appended appropriately.
 */
export const buildMessageFromList = (item: string, itemIndex: string, listLength: number, message: string) => {
  // Empty list
  if (listLength === 0) {
    return "";
  }
  // List only contains one item
  if (listLength === 1) {
    return `${message}${item}`;
  }
  // First item in list
  if (itemIndex === "0") {
    return `${message}${item}`;
  }
  // Last item in list
  if (Number(itemIndex) === listLength - 1) {
    return `${message} and ${item}`;
  }
  // Middle item in list
  return `${message}, ${item}`;
}

/**
 * Checks the result of an email-sending operation and builds a message string.
 * If there was an error, it appends the error message to the overall message.
 * If successful, it appends the recipient and their position in the list to the message.
 *
 * @param message - The message being built.
 * @param source - The source of the email ("Wind" or "Solar").
 * @param resendResult - The result of the email-sending operation.
 * @param recipient - The recipient's email address.
 * @param recipientsLength - The total number of recipients.
 * @param currentIndex - The index of the current recipient.
 * @returns The updated message string.
 */
export const checkEmailsSentAndBuildMessage = (
  message: string,
  source: "Wind" | "Solar",
  resendResult: CreateEmailResponse,
  recipient: string,
  recipientsLength: number,
  currentIndex: string
) => {
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

/**
 * Gets the date string for tomorrow in the 'YYYY-MM-DD' format based on the current date.
 */
export const getTomorrowDateString: () => string = () => {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}
