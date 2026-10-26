import dotenv from "dotenv";
dotenv.config();
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucket_name = process.env.AWS_S3_BUCKET;
const bucket_region = process.env.AWS_REGION;
const access_key = process.env.AWS_ACCESS_KEY_ID;
const secret_access_key = process.env.AWS_SECRET_ACCESS_KEY;

const s3 = new S3Client({
  credentials: {
    accessKeyId: access_key,
    secretAccessKey: secret_access_key,
  },
  region: bucket_region,
});

export const uploadImageToS3 = async (file, folder) => {
  const imageName = `${folder}/${Date.now()}-${file.originalname}`;

  const params = {
    Bucket: bucket_name,
    Key: imageName,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  const command = new PutObjectCommand(params);
  await s3.send(command);

  return imageName; // store this in DB
};

export const getSignedImageUrl = async (imageName) => {
  if (!imageName) return null;

  const params = {
    Bucket: bucket_name,
    Key: imageName,
  };

  const command = new GetObjectCommand(params);
  return await getSignedUrl(s3, command, { expiresIn: 3600 }); // URL valid for 1 hour
};
