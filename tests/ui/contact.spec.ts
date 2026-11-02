import { test, expect } from '@playwright/test';

const SUBJECTS = [
  'Customer service',
  'Webmaster',
  'Return',
  'Payments',
  'Warranty',
  'Status of my order',
];

/** A unique, harmless message on every call. Never uses real personal data. */
function newContactMessage() {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  return {
    firstName: 'Test',
    lastName: 'Sender',
    email: `qa.contact.${unique}@example.com`,
    subject: 'webmaster',
    // Long enough to pass any plausible minimum-length rule
    message:
      'This is an automated test message sent by a QA portfolio project. ' +
      'It is deliberately long so that it passes any minimum length validation on the form.',
  };
}

/** A harmless attachment created in memory, so no real file is ever uploaded. */
const DUMMY_ATTACHMENT = {
  name: 'test-attachment.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from('automated test attachment'),
};

test.describe('Contact', () => {
  test.beforeEach(async ({ page }) => {
    // Arrange (shared): reach the contact page the way a visitor would
    await page.goto('/');
    await page.getByTestId('nav-contact').click();
  });

  // Flow 1: the visitor opens the contact form
  test.describe('The form', () => {
    test('opens the contact page with all form fields @smoke', async ({ page }) => {
      // Assert
      await expect(page).toHaveURL(/\/contact/);
      await expect(page.getByRole('heading', { name: 'Contact' })).toBeVisible();
      await expect(page.getByTestId('first-name')).toBeVisible();
      await expect(page.getByTestId('last-name')).toBeVisible();
      await expect(page.getByTestId('email')).toBeVisible();
      await expect(page.getByTestId('subject')).toBeVisible();
      await expect(page.getByTestId('message')).toBeVisible();
      await expect(page.getByTestId('attachment')).toBeVisible();
      await expect(page.getByTestId('contact-submit')).toBeVisible();
    });

    test('the subject list offers every expected choice', async ({ page }) => {
      // Assert
      for (const subject of SUBJECTS) {
        await expect(page.getByTestId('subject')).toContainText(subject);
      }
    });
  });

  // Flow 2: the visitor submits the form without filling it in
  test.describe('Validation', () => {
    test('submitting an empty form does not send the message', async ({ page }) => {
      // Act
      await page.getByTestId('contact-submit').click();

      // Assert: still on the contact page.
      // TODO: assert the specific validation messages once you have inspected them.
      await expect(page).toHaveURL(/\/contact/);
      await expect(page.getByTestId('contact-submit')).toBeVisible();
    });
  });

  // Flow 3: the visitor sends a valid message
  test.describe('Sending a message', () => {
    test.fixme('a valid message is sent and a confirmation is shown', async ({ page }) => {
      // Arrange
      const contact = newContactMessage();
      await page.getByTestId('first-name').fill(contact.firstName);
      await page.getByTestId('last-name').fill(contact.lastName);
      await page.getByTestId('email').fill(contact.email);
      await page.getByTestId('subject').selectOption(contact.subject);
      await page.getByTestId('message').fill(contact.message);

      // Act
      await page.getByTestId('contact-submit').click();

      await expect(page.getByRole('alert')).toBeVisible();
    });

    test.fixme('a valid message with an attachment is sent', async ({ page }) => {
      // Arrange: the attachment is created in memory, never a real file from your computer
      const contact = newContactMessage();
      await page.getByTestId('first-name').fill(contact.firstName);
      await page.getByTestId('last-name').fill(contact.lastName);
      await page.getByTestId('email').fill(contact.email);
      await page.getByTestId('subject').selectOption(contact.subject);
      await page.getByTestId('message').fill(contact.message);
      await page.getByTestId('attachment').setInputFiles(DUMMY_ATTACHMENT);

      // Act
      await page.getByTestId('contact-submit').click();

      // Assert: TODO same as above. Also find out whether the app limits type or size.
      await expect(page.getByRole('alert')).toBeVisible();
    });
  });
});