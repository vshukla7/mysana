import os
import subprocess
import glob

def extract_frames(videos_dir, output_base_dir):
    # Ensure the output base directory (avatar) exists
    os.makedirs(output_base_dir, exist_ok=True)
    
    # Find all video files in the videos directory
    video_files = glob.glob(os.path.join(videos_dir, "*.*"))
    # Filter for common video extensions just in case
    valid_extensions = {".mp4", ".avi", ".mkv", ".mov"}
    video_files = [f for f in video_files if os.path.splitext(f)[1].lower() in valid_extensions]
    
    if not video_files:
        print(f"No video files found in {videos_dir}")
        return
        
    for video_path in video_files:
        # Get the filename without extension (e.g., 'idle' from 'idle.mp4')
        video_filename = os.path.basename(video_path)
        action_name, _ = os.path.splitext(video_filename)
        
        # Create a separate folder for this action inside the avatar folder
        action_dir = os.path.join(output_base_dir, action_name)
        os.makedirs(action_dir, exist_ok=True)
        
        print(f"Extracting frames for '{action_name}' into {action_dir}...")
        
        # Output pattern for frames: e.g. idle_1.jpg, idle_2.jpg
        # %d means a sequential number starting at 1
        output_pattern = os.path.join(action_dir, f"{action_name}_%d.jpg")
        
        # FFmpeg command to extract frames
        # -i: input file
        # -qscale:v 2: high quality JPEG
        # If you only want 1 frame per second, you can add "-r", "1" before output_pattern
        command = [
            "ffmpeg",
            "-y",
            "-i", video_path,
            "-r", "12",
            "-qscale:v", "2",
            output_pattern
        ]
        
        try:
            # Run the ffmpeg command.
            # stdout and stderr are routed to DEVNULL to reduce console spam.
            subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(f"  -> Successfully extracted frames for '{action_name}'.")
        except subprocess.CalledProcessError as e:
            print(f"  -> Error extracting frames for '{action_name}'. Ensure ffmpeg is in your PATH.")
            print(e)

if __name__ == "__main__":
    # Define directories
    videos_directory = r"c:\code playground\mysana\videos"
    avatar_directory = r"c:\code playground\mysana\public\avatar"
    
    print("Starting frame extraction...")
    extract_frames(videos_directory, avatar_directory)
    print("All tasks completed.")
