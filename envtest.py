import jpype
import jpype.imports
import os

print("JAVA_HOME:", os.environ.get("JAVA_HOME"))
print("JVM path:", jpype.getDefaultJVMPath())

jpype.startJVM()
print("JVM started successfully.")
jpype.shutdownJVM()


import tabula

tabula.environment_info()
