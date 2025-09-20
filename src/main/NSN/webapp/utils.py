import os
AVATAR_PATH = '/static/avatars'
def rebuildImageUrl(img_url):
    # rebuild image_url with os path

    if img_url != None and img_url != "":
        image = os.path.join(
            AVATAR_PATH, img_url)
        image = image.replace("\\", "/")
        return image
    return ""