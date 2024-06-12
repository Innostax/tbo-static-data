const axios = require("axios");

const axiosApiClient = async(config, maxRetries = 3, retryInterval = 1000) => {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const response = await axios(config);
      return response;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Check if the error is retryable (e.g., network error)
        if (retries === maxRetries - 1) {
          throw error;
        }
        // Retry after a retryInterval
        await new Promise(resolve => setTimeout(resolve, retryInterval));
        retries++;
      } else {
        // If it's not an Axios error, throw it immediately
        throw error;
      };
    }
  }
  
  throw new Error(`Max retries (${maxRetries}) exceeded`);
};

module.exports = { axiosApiClient };
