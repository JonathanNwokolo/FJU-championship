import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  updateDoc,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { v4 as uuid } from 'uuid';
import { db, storage } from './firebase';

// ---------------------------------------------------------------------------
// 1. uploadMuralPhoto
// ---------------------------------------------------------------------------

export async function uploadMuralPhoto(
  uri: string,
  championshipId: string,
  postId: string,
): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const storageRef = ref(storage, `mural/${championshipId}/${postId}.jpg`);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(storageRef);
}

// ---------------------------------------------------------------------------
// 2. createPost
// ---------------------------------------------------------------------------

export async function createPost(
  championshipId: string,
  round: number,
  authorId: string,
  authorName: string,
  teamId: string,
  imageUri: string,
  caption: string,
  authorPhotoUrl?: string,
): Promise<string> {
  const postId = uuid();
  const imageUrl = await uploadMuralPhoto(imageUri, championshipId, postId);
  await setDoc(doc(db, 'mural_posts', postId), {
    id: postId,
    championshipId,
    round,
    authorId,
    authorName,
    authorPhotoUrl: authorPhotoUrl ?? null,
    teamId,
    imageUrl,
    caption: caption.trim(),
    likesCount: 0,
    createdAt: serverTimestamp(),
  });
  return postId;
}

// ---------------------------------------------------------------------------
// 3. toggleLike — usa o userId como docId para evitar duplicatas
// ---------------------------------------------------------------------------

export async function toggleLike(postId: string, userId: string): Promise<void> {
  const likeRef = doc(db, 'mural_posts', postId, 'likes', userId);
  const postRef = doc(db, 'mural_posts', postId);
  const likeSnap = await getDoc(likeRef);

  if (likeSnap.exists()) {
    await Promise.all([
      deleteDoc(likeRef),
      updateDoc(postRef, { likesCount: increment(-1) }),
    ]);
  } else {
    await Promise.all([
      setDoc(likeRef, { userId, createdAt: serverTimestamp() }),
      updateDoc(postRef, { likesCount: increment(1) }),
    ]);
  }
}

// ---------------------------------------------------------------------------
// 4. deletePost
// ---------------------------------------------------------------------------

export async function deletePost(
  postId: string,
  championshipId: string,
): Promise<void> {
  await deleteDoc(doc(db, 'mural_posts', postId));
  try {
    await deleteObject(ref(storage, `mural/${championshipId}/${postId}.jpg`));
  } catch {
    // Storage deletion é best-effort
  }
}

// ---------------------------------------------------------------------------
// Firebase Storage Rules (adicionar no Console > Storage > Rules):
//
// rules_version = '2';
// service firebase.storage {
//   match /b/{bucket}/o {
//     match /mural/{championshipId}/{allPaths=**} {
//       allow read: if true;
//       allow write: if request.auth != null
//                    && request.resource.size < 5 * 1024 * 1024;
//     }
//   }
// }
// ---------------------------------------------------------------------------
