import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

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
 * Upload player photo - returns the public URL
 */
export async function uploadPlayerPhoto(
  localUri: string,
  playerId: string
): Promise<string> {
  const path = `players/${playerId}/photo_${Date.now()}.jpg`;
  return uploadToFirebaseStorage(localUri, path);
}

/**
 * Upload user profile photo - returns the public URL
 */
export async function uploadUserPhoto(
  localUri: string,
  userId: string
): Promise<string> {
  const path = `users/${userId}/avatar.jpg`;
  return uploadToFirebaseStorage(localUri, path);
}

/**
 * Upload team logo - returns the public URL
 */
export async function uploadTeamLogo(
  localUri: string,
  teamId: string
): Promise<string> {
  const path = `teams/${teamId}/logo_${Date.now()}.jpg`;
  return uploadToFirebaseStorage(localUri, path);
}
