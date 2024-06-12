require('dotenv').config();
require('./dbConnection');
const mongoose = require('mongoose');
const { xml2js } = require('xml-js');
const { axiosApiClient } = require('./AxiosApiClient');
const async = require('async');
const { enabledCountries } = require('./countries');

const POST = 'post';

const filterKeys = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(filterKeys);
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const cleanedKey = key.replace(/^_/, '').trim();
      acc[cleanedKey] = filterKeys(obj[key]);
      return acc;
    }, {});
  }
  return obj;
}

const xmlToJson = (data = '') => {
  const jsonData = xml2js(data, { compact: true, spaces: 2 });
  return filterKeys(jsonData);
}

const { 
  TBO_CLIENT_ID,
  TBO_USERNAME,
  TBO_PASSWORD,
  COUNTRIES,
  TBO_BASE_URL,
  END_USER_IP
} = process.env;

const generateAuthToken = async () => {
  const config = {
    method: POST,
    url: `${TBO_BASE_URL}/SharedData.svc/rest/Authenticate`,
    data: {
      "ClientId": TBO_CLIENT_ID,
      "UserName": TBO_USERNAME,
      "Password": TBO_PASSWORD, 
      "EndUserIp": END_USER_IP
    },
  };
  const response = await axiosApiClient(config);
  return response.data.TokenId;
}

const getDestinationSearchStaticData = async (TokenId, countryCode) => {
  const config = {
    method: POST,
    url: `${TBO_BASE_URL}/StaticData.svc/rest/GetDestinationSearchStaticData`,
    data: {
      "EndUserIp": END_USER_IP,
      "TokenId": TokenId,
      "CountryCode": countryCode,
      "SearchType": "2"
    },
  };
  const response = await axiosApiClient(config);
  return response.data.Destinations;
}

const getHotelStaticData = async (hotelId, TokenId) => {
  const config = {
    method: POST,
    url: `${TBO_BASE_URL}/StaticData.svc/rest/GetHotelStaticData`,
    data: {
      "HotelId": hotelId,
      "ClientId": TBO_CLIENT_ID,
      "EndUserIp": END_USER_IP,
      "TokenId": TokenId
    },
  };
  const response = await axiosApiClient(config);
  return response.data;
}

const fetchHotelData = async () => {
  try {
    const TokenId = await generateAuthToken();
    const countries = enabledCountries;
    let hotelStaticDataDetails = [];

    const ModelDataSchema = new mongoose.Schema({}, { strict: false });
    let dataModel = mongoose.model('hotelData', ModelDataSchema);

    const queue = async.queue(async (task) => {
      try {
        const { countryCode, destinationId } = task;
        const response = await getHotelStaticData(destinationId, TokenId);
        response.HotelData = xmlToJson(response.HotelData);
        response.HotelId = destinationId;
        delete response.TokenId;
        await dataModel.insertMany([response]);
        hotelStaticDataDetails.push(response);
      } catch (error) {
        console.error(`Error processing destinationId ${task.destinationId}:`, error);
        throw error; // Rethrow the error to halt the process
      }
    }, 10); // Control concurrency with a limit of 10
    
    queue.drain(() => {
      console.log("All tasks have been processed");
    });
    
    queue.error((err, task) => {
      console.error(`Task processing failed for destinationId ${task.destinationId}:`, err);
    }); // Control concurrency with a limit of 10

    for (const countryCode of countries) {
      const destinationSearchStaticDataDetails = await getDestinationSearchStaticData(TokenId, countryCode.code);
      destinationSearchStaticDataDetails.forEach(destination => {
        queue.push({ countryCode: countryCode.code, destinationId: destination.DestinationId });
      });
    }

    // await queue.drain();

    return hotelStaticDataDetails;
  } catch (error) {
    console.error('Error occurred while fetching hotel data:', error);
    throw error;
  }
}

fetchHotelData().then(response => {
  console.log('Hotel data fetched successfully:', response);
}).catch(error => {
  console.error('Error:', error);
});
