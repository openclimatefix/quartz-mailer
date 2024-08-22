import { buildMessageFromList, checkEmailsSentAndBuildMessage, getTomorrowDateString } from './utils';
import { CreateEmailResponse } from "resend";
import exp = require("node:constants");

describe('buildMessageFromList', () => {
  test('should return only item string when there is only one item', () => {
    const result = buildMessageFromList('apple', '0', 1, 'Fruit: ');
    expect(result).toEqual('Fruit: apple');
  });

  test('should return first item in list', () => {
    const result = buildMessageFromList('apple', '0', 3, 'Fruits: ');
    expect(result).toEqual('Fruits: apple');
  });

  test('should return middle item in list with preceding comma', () => {
    const result = buildMessageFromList('banana', '1', 3, 'Fruits: apple');
    expect(result).toEqual('Fruits: apple, banana');
  });

  test('should return last item in list with preceding and', () => {
    const result = buildMessageFromList('cherry', '2', 3, 'Fruits: apple, banana');
    expect(result).toEqual('Fruits: apple, banana and cherry');
  });

  test('should return empty string when list is empty', () => {
    const result = buildMessageFromList('', '0', 0, '');
    expect(result).toEqual('');
  });

  test('should return a full sentence with multiple items from an array', () => {
    const listArray = ['apple', 'banana', 'cherry'];
    let message = '';
    listArray.forEach((item, index) => {
      message = buildMessageFromList(item, index.toString(), listArray.length, message);
    });
    expect(message).toEqual('apple, banana and cherry');
  });
});

describe('getTomorrowDateString', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-06-01'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should return date string for the next day', () => {
    const result = getTomorrowDateString();
    expect(result).toEqual('2024-06-02');
  });
});

describe('checkEmailsSentAndBuildMessage', () => {
  let message: string;
  let resendResult: CreateEmailResponse;
  let recipient: string;
  const recipientLength = 5;
  const currentIndex = "3";

  beforeEach(() => {
    message = "";
    recipient = "test@example.com";
    resendResult = {data: null, error: null};
  });

  test('should add error message when there is an error in resendResult', () => {
    resendResult.error = {message: 'Cannot send email', name: 'invalid_api_Key'};
    console.log = jest.fn();

    const result = checkEmailsSentAndBuildMessage(message, "Wind", resendResult, recipient, recipientLength, currentIndex);
    expect(result).toContain('Cannot send email');
    expect(console.log).toHaveBeenCalledWith('Wind email not sent');
    expect(console.log).toHaveBeenCalledWith('Cannot send email');
  });

  test('should build a message list when there is no error in resendResult', () => {
    resendResult.data = {id: "123"};
    console.log = jest.fn();

    const result = checkEmailsSentAndBuildMessage(message, "Wind", resendResult, recipient, recipientLength, currentIndex);
    expect(result).toContain(recipient);
    expect(console.log).toHaveBeenCalledWith('Wind Resend response: ', resendResult.data);
  });

  test('should return a full sentence with multiple recipients', () => {
    const recipients = ['test@email.com', 'test2@email.com'];
    let message = 'Emails sent to ';
    console.log = jest.fn();
    resendResult.data = {id: "123"};

    recipients.forEach((recipient, index) => {
      message = checkEmailsSentAndBuildMessage(message, "Wind", resendResult, recipient, recipients.length, index.toString());
    });
    expect(message).toEqual('Emails sent to test@email.com and test2@email.com');
    expect(console.log).toHaveBeenCalledWith('Wind Resend response: ', resendResult.data);
    expect(console.log).toHaveBeenCalledTimes(2);
  });
});

