const axios = require('axios');

class WATIService {
  constructor() {
    this.baseURL = process.env.WATI_BASE_URL || 'https://live-server-109100.wati.io';
    this.apiToken = process.env.WATI_API_TOKEN;
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Send a text message via WATI
   * @param {string} whatsappNumber - WhatsApp number (with country code, no +)
   * @param {string} message - Message to send
   */
  async sendMessage(whatsappNumber, message) {
    try {
      const payload = {
        number: whatsappNumber,
        message: message
      };

      const response = await this.client.post('/api/v1/sendMessage', payload);
      return response.data;
    } catch (error) {
      console.error('WATI Send Message Error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send a template message via WATI
   * @param {string} whatsappNumber - WhatsApp number (with country code, no +)
   * @param {string} templateName - Template name
   * @param {Array} parameters - Template parameters
   */
  async sendTemplateMessage(whatsappNumber, templateName, parameters = []) {
    try {
      const payload = {
        number: whatsappNumber,
        template_name: templateName,
        parameters: parameters
      };

      const response = await this.client.post('/api/v1/sendTemplateMessage', payload);
      return response.data;
    } catch (error) {
      console.error('WATI Send Template Message Error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get contact information
   * @param {string} whatsappNumber - WhatsApp number
   */
  async getContact(whatsappNumber) {
    try {
      const response = await this.client.get(`/api/v1/getContact/${whatsappNumber}`);
      return response.data;
    } catch (error) {
      console.error('WATI Get Contact Error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get message history
   * @param {string} whatsappNumber - WhatsApp number
   * @param {number} limit - Number of messages to retrieve
   */
  async getMessageHistory(whatsappNumber, limit = 10) {
    try {
      const response = await this.client.get(`/api/v1/getMessages/${whatsappNumber}?limit=${limit}`);
      return response.data;
    } catch (error) {
      console.error('WATI Get Message History Error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Format phone number for WATI (remove + and ensure proper format)
   * @param {string} phoneNumber - Phone number to format
   */
  formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // If it starts with 91 (India), keep it as is
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      return cleaned;
    }
    
    // If it's a 10-digit Indian number, add 91
    if (cleaned.length === 10) {
      return '91' + cleaned;
    }
    
    // Return as is if it's already properly formatted
    return cleaned;
  }

  /**
   * Extract bike details from user message using simple keyword matching
   * @param {string} message - User message
   */
  extractBikeDetails(message) {
    const details = {
      make: null,
      model: null,
      variant: null,
      year: null,
      km: null,
      owner: null
    };

    const lowerMessage = message.toLowerCase();

    // Extract year (4-digit number)
    const yearMatch = message.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      details.year = parseInt(yearMatch[0]);
    }

    // Extract kilometers (numbers followed by k, km, thousand, etc.)
    const kmMatch = lowerMessage.match(/(\d+(?:\.\d+)?)\s*(?:k|km|thousand|thousands)/);
    if (kmMatch) {
      details.km = parseInt(parseFloat(kmMatch[1]) * 1000);
    } else {
      // Try to find just numbers that could be km
      const numberMatch = lowerMessage.match(/\b(\d{4,6})\b/);
      if (numberMatch && parseInt(numberMatch[1]) > 1000) {
        details.km = parseInt(numberMatch[1]);
      }
    }

    // Extract owner (1st, 2nd, 3rd, first, second, third)
    const ownerMatch = lowerMessage.match(/\b(1st|2nd|3rd|first|second|third)\b/);
    if (ownerMatch) {
      const ownerText = ownerMatch[1];
      if (ownerText.includes('1') || ownerText.includes('first')) {
        details.owner = 1;
      } else if (ownerText.includes('2') || ownerText.includes('second')) {
        details.owner = 2;
      } else if (ownerText.includes('3') || ownerText.includes('third')) {
        details.owner = 3;
      }
    }

    // Common bike brands and models (you can expand this)
    const bikeBrands = [
      'honda', 'hero', 'bajaj', 'tvs', 'yamaha', 'royal enfield', 'ktm', 'suzuki',
      'mahindra', 'ducati', 'kawasaki', 'benelli', 'aprilia', 'triumph'
    ];

    for (const brand of bikeBrands) {
      if (lowerMessage.includes(brand)) {
        details.make = brand;
        break;
      }
    }

    return details;
  }
}

module.exports = new WATIService();

