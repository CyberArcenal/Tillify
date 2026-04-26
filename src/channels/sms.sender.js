// src/channels/sms.sender.js

const twilio = require("twilio");
const { getTwilioConfig } = require("../utils/system");
const { logger } = require("../utils/logger");
const notificationService = require("../services/NotificationService");

class SmsSender {
  constructor() {
    this.client = null;
    this.config = null;
  }

  async initialize() {
    this.config = await getTwilioConfig();

    if (!this.config) {
      logger.error("❌ SMS configuration missing");
      throw new Error("SMS configuration missing");
    }

    const { accountSid, authToken } = this.config;

    if (!accountSid || !authToken) {
      logger.error(
        "❌ SMS configuration incomplete → accountSid or authToken not set",
      );
      throw new Error("SMS configuration incomplete");
    }

    this.client = twilio(accountSid, authToken);
    logger.info("✅ Twilio client initialized successfully");
    return this;
  }

  /**
   * @param {string} to
   * @param {string} message
   */
  async send(to, message, options = {}) {
    try {
      if (!this.client) {
        await this.initialize();
      }

      // @ts-ignore
      const from = this.config.messagingServiceSid || this.config.phoneNumber;
      const formattedTo = this.formatPhoneNumber(to);

      const smsOptions = {
        body: message,
        from,
        to: formattedTo,
        ...options,
      };

      logger.info(
        `Preparing to send SMS → From: ${from}, To: ${formattedTo}, Message: "${message}"`,
      );

      // @ts-ignore
      const result = await this.client.messages.create(smsOptions);

      logger.info(
        `SMS successfully sent → To: ${formattedTo}, SID: ${result.sid}, Status: ${result.status}`,
      );

      return {
        success: true,
        sid: result.sid,
        status: result.status,
        price: result.price,
      };
    } catch (error) {
      // @ts-ignore
      logger.error(`❌ Failed to send SMS → To: ${to}`, error);

      try {
        await notificationService.create(
          {
            userId: 1,
            title: "SMS Sending Failed",
            // @ts-ignore
            message: `Failed to send SMS to ${to}: ${error.message}`,
            type: "error",
            metadata: {
              to,
              message,
              // @ts-ignore
              error: error.message,
              // @ts-ignore
              stack: error.stack,
            },
          },
          "system",
        );
      } catch (notifErr) {
        // @ts-ignore
        logger.error("Failed to send error notification for SMS", notifErr);
      }
      throw error;
    }
  }

  // @ts-ignore
  formatPhoneNumber(phone) {
    let formatted = phone.replace(/\D/g, "");
    if (formatted.startsWith("0")) {
      formatted = "+63" + formatted.substring(1);
    } else if (!formatted.startsWith("+")) {
      formatted = "+" + formatted;
    }
    return formatted;
  }

  // @ts-ignore
  async sendBatch(recipients, message, options = {}) {
    const results = [];
    logger.info(
      `Bulk SMS send initiated → Total recipients: ${recipients.length}`,
    );

    for (const recipient of recipients) {
      try {
        const result = await this.send(recipient, message, options);
        results.push({ recipient, ...result });
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        // @ts-ignore
        logger.error(`❌ Failed batch SMS → To: ${recipient}`, error);
        // @ts-ignore
        results.push({ recipient, success: false, error: error.message });
      }
    }

    logger.info(
      `Bulk SMS send completed → Success: ${results.filter((r) => r.success).length}, Failed: ${results.filter((r) => !r.success).length}`,
    );

    return results;
  }
}

module.exports = new SmsSender();
