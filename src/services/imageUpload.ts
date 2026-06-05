import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as FileSystem from 'expo-file-system';
import { storage, isFirebaseConfigured } from './firebase';

const IMGUR_CLIENT_ID = 'YOUR_IMGUR_CLIENT_ID'; // Substituir se usar Imgur

/**
 * Upload image to Firebase Storage
 */
async function uploadToFirebaseStorage(
  localUri: string,
  path: string
): Promise<string> {
  // Read the file as blob
  const response = await fetch(localUri);
  const blob = await response.blob();

  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);

  const downloadUrl = await getDownloadURL(storageRef);
  return downloadUrl;
}

/**
 * Upload image to Imgur (fallback if Firebase Storage not available)
 */
async function uploadToImgur(localUri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const response = await fetch('https://api.imgur.com/3/image', {
    method: 'POST',
    headers: {
      Authorization: `Client-ID ${IMGUR_CLIENT_ID}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image: base64, type: 'base64' }),
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.data?.error || 'Imgur upload failed');
  }
  return data.data.link;
}

/**
 * Upload player photo - returns the public URL
 */
export async function uploadPlayerPhoto(
  localUri: string,
  playerId: string
): Promise<string> {
  const path = `players/${playerId}/photo_${Date.now()}.jpg`;

  // Try Firebase Storage first
  if (isFirebaseConfigured) {
    try {
      return await uploadToFirebaseStorage(localUri, path);
    } catch (error) {
      console.warn('Firebase Storage failed, trying Imgur...', error);
    }
  }

  // Fallback to Imgur
  return uploadToImgur(localUri);
}

/**
 * Upload user profile photo - returns the public URL
 */
export async function uploadUserPhoto(
  localUri: string,
  userId: string
): Promise<string> {
  const path = `users/${userId}/avatar.jpg`;

  if (isFirebaseConfigured) {
    try {
      return await uploadToFirebaseStorage(localUri, path);
    } catch (error) {
      console.warn('Firebase Storage failed, trying Imgur...', error);
    }
  }

  return uploadToImgur(localUri);
}
