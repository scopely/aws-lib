var request = require("request");
var qs = require("querystring");
var crypto = require("crypto");
var events = require("events");
var xml2js = require("xml2js");

// include specific API clients
var ec2 = require("./ec2");
var prodAdv = require("./prodAdv");
var simpledb = require("./simpledb");
var sqs = require("./sqs");
var sns = require("./sns");
var ses = require("./ses");

// Returns the hmac digest using the SHA256 algorithm.
function hmacSha256(key, toSign) {
  var hash = crypto.createHmac("sha256", key);
  return hash.update(toSign).digest("base64");
}
// a generic AWS API Client which handles the general parts
var genericAWSClient = function(obj) {
  var creds = crypto.createCredentials({});
  if (null == obj.secure)
    obj.secure = true;

  obj.call = function (action, query, callback) {
    if (obj.secretAccessKey == null || obj.accessKeyId == null) {
      throw("secretAccessKey and accessKeyId must be set")
    }

    var now = new Date();

    if (!obj.signHeader) {
      // Add the standard parameters required by all AWS APIs
      query["Timestamp"] = now.toISOString();
      query["AWSAccessKeyId"] = obj.accessKeyId;
      query["Signature"] = obj.sign(query);
    }

    var body = qs.stringify(query);
    var headers = {
      "Host": obj.host,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      "Content-Length": body.length
    };

    if (obj.signHeader) {
      headers["Date"] = now.toUTCString();
      headers["x-amzn-authorization"] =
      "AWS3-HTTPS " +
      "AWSAccessKeyId=" + obj.accessKeyId + ", " +
      "Algorithm=HmacSHA256, " +
      "Signature=" + hmacSha256(obj.secretAccessKey, now.toUTCString());
    }

    var url = (obj.secure ? "https://" : "http://") + obj.host + obj.path;

    var options = {
      url: url,
      method: 'POST',
      headers: headers,
      timeout: 10000 //TODO make this configurable
    };

    request(options, function (error, response, body) {
      if(error){
        console.log("Since we're ghetto like this, there was an error in aws-lib.  Data follows.");
        console.log("ERROR:")
        console.log(error);
        console.log("RESPONSE:")    
        console.log(response);
        console.log("BODY:")
        console.log(body);

        callback(null);
      }
      else{
        var parser = new xml2js.Parser();
        parser.addListener('end', function(result) {
          callback(result);
        });
        parser.parseString(body);  
      }
    });
  }

  /*
   Calculate HMAC signature of the query
   */
  obj.sign = function (query) {
    var keys = []
    var sorted = {}

    for(var key in query)
      keys.push(key)

    keys = keys.sort()

    for(n in keys) {
      var key = keys[n]
      sorted[key] = query[key]
    }
    var stringToSign = ["POST", obj.host, obj.path, qs.stringify(sorted)].join("\n");

    // Amazon signature algorithm seems to require this
    stringToSign = stringToSign.replace(/'/g,"%27");
    stringToSign = stringToSign.replace(/\*/g,"%2A");
    stringToSign = stringToSign.replace(/\(/g,"%28");
    stringToSign = stringToSign.replace(/\)/g,"%29");
    stringToSign = stringToSign.replace(/\!/g,"%21");

    return hmacSha256(obj.secretAccessKey, stringToSign);
  }
  return obj;
}
exports.createEC2Client = ec2.init(genericAWSClient);
exports.createProdAdvClient = prodAdv.init(genericAWSClient);
exports.createSimpleDBClient = simpledb.init(genericAWSClient);
exports.createSQSClient = sqs.init(genericAWSClient);
exports.createSNSClient = sns.init(genericAWSClient);
exports.createSESClient = ses.init(genericAWSClient);
